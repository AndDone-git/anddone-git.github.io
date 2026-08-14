---
layout: default
---

<p style="margin:0 0 2.5rem; max-width:34rem;">
Writeups of vulnerabilities I have found and reported. Each entry lists its
identifier and whether a fix exists at the time of writing.
</p>

<ul class="ledger">
{% for post in site.posts %}
  <li class="entry">
    <div class="meta">
      <time datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: "%d %b %Y" }}</time>
      {% if post.cve %}<span>{{ post.cve }}</span>{% endif %}
      {% if post.status %}<span class="status" data-state="{{ post.status | downcase }}">{{ post.status | upcase }}</span>{% endif %}
    </div>
    <h2><a href="{{ post.url | relative_url }}">{{ post.title }}</a></h2>
    {% if post.summary %}<p>{{ post.summary }}</p>{% endif %}
  </li>
{% else %}
  <li class="empty">No posts yet.</li>
{% endfor %}
</ul>
