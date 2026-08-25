---
layout: post
title: "One Parameter, Two Bugs: From a Forgotten Video Player to Unauthenticated RCE"
date: 2026-08-25
cve: CVE-2026-19912 CVE-2026-19913
cvss: 10.0
dek: >
  A bug bounty hunt that started with an outdated JavaScript library and ended
  with an unauthenticated remote code execution chain in software used by
  universities, broadcasters and enterprises worldwide, plus a vendor that
  never replied.
---

## TL;DR
{: .ad-label }

While hunting on a public bug bounty program I found a Kaltura mwEmbed video player deployment on one of the target's subdomains. A single undocumented request parameter, `ServiceUrl`, turned out to control the URL that the server-side PHP client fetches *and then deserializes*.

That one design flaw resulted in two distinct vulnerabilities:

|            | Class                                                         | CVE            | CVSS 3.1 (reporter) |
| ---------- | ------------------------------------------------------------- | -------------- | ------------------- |
| **Vuln 1** | Unauthenticated arbitrary file read.                          | [CVE-2026-19913](https://www.cve.org/CVERecord?id=CVE-2026-19913) | 9.1                 |
| **Vuln 2** | Unauthenticated RCE via PHP object injection + path traversal | [CVE-2026-19912](https://www.cve.org/CVERecord?id=CVE-2026-19912) | 10.0                |

Both are fully unauthenticated, server-side, and need no user interaction. No account, no password, no Kaltura Session token, no cookie. Neither was known to the vendor.

As of August 2026 the deserialization sink is still present in current Kaltura Server source code, no advisory or CVE exists. Despite outreach from two email addresses, LinkedIn, and through a CERT that escalated the case to CISA, **Kaltura has not responded**.

---

## Chapter 1: The Discovery and File Read vulnerability

### An old player on a forgotten subdomain

During enumeration of a Bug Bounty target's attack surface, i was going through a large list of subdomains, using an automated tool (`httpx`) to filter accessible and unique web applications, followed by manually visiting the applications with Burp Suite as my proxy. I noticed that the **Kaltura mwEmbed HTML5 video player** running on one subdomain was using outdated JavaScript libraries, which intrigued me enough to look deeper into the functionality of the application.

After enumerating the endpoints and running Burp Suite extensions like Param Miner, I discovered an undocumented parameter, `ServiceUrl`, on the endpoint `/html5/html5lib/v2.103/mwEmbedLoader.php`. Supplying a value caused an error visible in the response:

```
Error getting sources from server. Please try again.
failed to unserialize server result
```

Two enormous pieces of information in one string. "Server result" means the value I control is being used as a URL that the *server* then fetches. "Failed to unserialize" means the bytes coming back from that URL are being passed into PHP's `unserialize()`, and that when it fails, the raw fetched bytes are reflected back to me.

When I provided the value `file:///etc/passwd?`, with a question mark to close any trailing data, it returned the contents of `/etc/passwd`, confirming that this parameter is vulnerable to arbitrary file read.

![alt](/assets/img/LFI.png)
*Unauthenticated arbitrary file read, from a browser, with no session, no cookie, no Kaltura Session token, and no user interaction.*

I escalated it to something with real consequences by reading the Kaltura application configuration at `/opt/kaltura/app/configurations/local.ini`, which contains **plaintext database connection strings, credentials including admin and console passwords, and internal host references**.

### Single bug bounty target problem, or vendor problem?

The version string in the URL, `v2.103`, is the newest html5lib release Kaltura publishes. That ruled out the comfortable explanation, that I had simply found one bug bounty target running something ancient.

So I went looking for the vulnerability in Kaltura's own source, rather than assuming it was specific to this deployment. I pulled the current Kaltura Server source (tag [West-23.5.0](https://github.com/kaltura/server/tree/West-23.5.0)) and found the code responsible in the file `deployment/uiconf/KalturaClientBase.php`, the function `doQueue()` builds its request URL by concatenating `serviceUrl` with no validation, and when the response fails to parse, it includes the raw fetched bytes into the error message.

That made it a vendor problem rather than a customer problem, and an unpatched one. A search-engine  
query for the library path (`inurl:/html5/html5lib/`) returned **630+ results**. 
![alt](/assets/img/searchresults.png)
That figure indicates exposure of the component rather than a count of confirmed-vulnerable hosts, but the order of magnitude is the point: this was not one forgotten server with an outdated web application.

The vulnerable loader is also exposed on Kaltura's own shared, multi-tenant production CDN hosts, which serve player content for a large number of their customers. The vendor's own infrastructure is affected, not only third-party deployments.

I emailed Kaltura on 23 March 2026. No reply.

Realising this affected organisations worldwide rather than a single bug bounty target pushed me to dig deeper into an even more impactful vulnerability class, insecure deserialization, which can lead to remote code execution.

---

## Chapter 2: From File Read to Remote Code Execution

### Following the sink

Kaltura Server and mwEmbed are open source, so I could stop guessing and start reading. This phase was manual code review supported by Claude. I used it to work out which functions receive the injected object, and from there to reason about which sinks the injected object could actually reach, and to find a way to abuse the caching mechanism to store a web shell under the web root. With Kaltura Server and mwEmbed running in a Docker container that Claude could reach, code review stopped being a one-way exercise. A theory about where the injected object ended up could be checked immediately against a live instance.

The core of it, in `KalturaClientBase::doQueue()`:

```php
$url = $this->config->serviceUrl . "/api_v3/index.php?service=";
// ...
list($postResult, $error) = $this->doHttpRequest($url, $params, $files);
// ...
$result = @unserialize($postResult);
if ($result === false && serialize(false) !== $postResult) {
    throw new KalturaClientException(
        "failed to unserialize server result\n$postResult", ...
    );
}
```

Three things go wrong here:

1. **`serviceUrl` is attacker-controlled**, so the attacker chooses the host and the scheme the server fetches from.
2. **The response is deserialized with no origin check**, no signature, and no class allow-list. The client explicitly requests PHP's serialize format instead of JSON, which can only produce data and cannot instantiate anything.
3. **The failure path reflects the fetched bytes back to the requester**, which is what made the file read self-evident from the browser.

So I can make a Kaltura server instantiate a PHP object of my choosing. The remaining question: **what does the application then do with that object?**

### The write primitive

Following the object downstream through mwEmbed:

- `loadUiConfFromApi()` takes a property off the deserialized object and hands it to the file cache layer.
- `kInfraFileSystemCacheWrapper::getFilePath()`, in `infra/cache/`, builds the on-disk destination by concatenating the cache base directory with a path derived from the **`uiconf_id` request parameter**, with no sanitisation.

That is the whole chain. I control the *content* written to disk, via the deserialized object, and I control the *destination path*, via traversal sequences in `uiconf_id`. Content control plus path control, on a PHP server, under a webroot that executes PHP.

The write escapes the cache directory, lands in a web-accessible directory as a `.php` file, and executes on request as the web server user.

### Exploit

I did **not** test the RCE against the bug bounty target, or against anyone else's production system. Demonstrating the file read on the target was already sufficient to establish the vulnerability's existence and impact for the report.

Instead I validated the full chain against the Docker container `kaltura/server:latest`, a default installation with no hardening changes. It is worth mentioning that the vendor newest published docker container is from januari 2019 with Kaltura Server version 14.12.0, on CentOS 6.

I wrote a proof of concept (`exploit.py`) that starts a listener, triggers the chain, and verifies the dropped shell.

![alt](/assets/img/exploit-and-host-payload.png)
![alt](/assets/img/webshell-accessible-from-webroot.png)
### Verifying against the current release
To be exact about scope: the end-to-end web shell drop was demonstrated on the Kaltura Server docker image from 2019. What I verified on the current release ([`West-23.5.0`](https://github.com/kaltura/server/tree/West-23.5.0)) is that both halves of the chain are present, and that the deserialization half still executes as described.

**The deserialization sink is unchanged.** `deployment/uiconf/KalturaClientBase.php` is byte-identical to the 2019 copy: same unvalidated `serviceUrl` concatenation, same `unserialize()` of the fetched response, same fetched bytes pasted into the exception message.

It also still works. I ran that exact file on PHP version 8.3.33 with libcurl version 8.14.1 and pointed `serviceUrl` at a local file. The library fetched it, failed to deserialize it, and handed back its contents inside the exception.

**The write primitive is unchanged too.** In `infra/cache/kInfraFileSystemCacheWrapper.php`, `getFilePath()` still concatenates `dirname($key)` onto the cache base folder with no `realpath()` containment, no rejection of traversal sequences, and no separator filtering.

The file-drop step depends on the file-based cache backend, which is the Kaltura default. A memcache-only configuration may suppress the write and therefore that specific RCE path. However, that does not make the deployment safe. The underlying deserialization of attacker-controlled data and the unsanitised path construction are present regardless of cache backend, and the file read does not depend on the cache backend at all.

So both halves are present in the current release, and the deserialization half demonstrably still executes. What I have not done is drive the complete chain end to end on a current installation. The vendor publishes no current container image, and their installation documentation targets only operating systems that have reached end of life.

---

## Disclosure timeline

| Date         | Action                                                          |
| ------------ | --------------------------------------------------------------- |
| `23-03-2026` | Initial report sent to vendor security contact (personal email) |
| `13-04-2026` | Re-sent from corporate email address, in case of spam filtering |
| `23-05-2026` | Outreach to vendor CISO via LinkedIn                            |
| `02-07-2026` | Report escalated through national CERT                          |

---

## If you run Kaltura Server

No patch exists. Until one does:

- **Block or remove `mwEmbedLoader.php`** at your WAF, reverse proxy or CDN. If you are not actively serving legacy mwEmbed players, this path has no reason to be reachable.
- **Reject any `ServiceUrl` value that is not your own API host**, and explicitly reject non-`http(s)` schemes.
- **Reject `uiconf_id` values** containing traversal sequences, absolute paths or directory separators.
- **Deny PHP execution in cache directories.** Good hygiene regardless, and it breaks the drop step.
- **Restrict outbound network access** from the application server. The RCE requires it to fetch from an attacker-controlled host.
- **If you have been exposed, rotate everything in `local.ini`**: database credentials, admin and console passwords, partner secrets and API keys. Then check your logs for requests to `mwEmbedLoader.php` carrying a `ServiceUrl` parameter, and for unexpected `.php` files under your html5lib cache directories.


