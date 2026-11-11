// Saves every admin change as a commit in the site's GitHub repo, so the public site
// stays plain static files and every edit has history (and can be undone).
const utf8 = { enc: new TextEncoder(), dec: new TextDecoder() };
const fromB64 = (s) => utf8.dec.decode(Uint8Array.from(atob(s.replace(/\s/g, "")), (c) => c.charCodeAt(0)));

export class GitHubStore {
  constructor({ token, repo, branch = "main" }) {
    if (!token || !repo) throw new Error("GITHUB_TOKEN and GITHUB_REPO must be set");
    Object.assign(this, { token, repo, branch });
  }

  async api(path, init = {}) {
    const res = await fetch(`https://api.github.com/repos/${this.repo}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "ckhaven-admin",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (!res.ok) {
      const err = new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
      err.gh = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  /** -> { text, sha } or null. `ref` may be a branch or commit sha. */
  async read(path, ref = this.branch) {
    try {
      const r = await this.api(`/contents/${path}?ref=${encodeURIComponent(ref)}`);
      return { text: fromB64(r.content), sha: r.sha };
    } catch (e) {
      if (e.gh === 404) return null;
      throw e;
    }
  }

  /**
   * One commit for several files. files: [{ path, text } | { path, base64 }].
   * expect: { path: blobSha|null } -> refuses (409) if someone changed that file meanwhile.
   */
  async commit(files, message, author, expect = {}) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const head = (await this.api(`/git/ref/heads/${this.branch}`)).object.sha;
      for (const [path, sha] of Object.entries(expect)) {
        const cur = await this.read(path, head);
        if ((cur?.sha || null) !== sha) throw Object.assign(new Error("Someone else saved a change a moment ago. Reload to see it, then try again."), { status: 409 });
      }
      const base = await this.api(`/git/commits/${head}`);
      const entries = [];
      for (const f of files) {
        if (f.base64) {
          const blob = await this.api("/git/blobs", { method: "POST", body: JSON.stringify({ content: f.base64, encoding: "base64" }) });
          entries.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
        } else {
          entries.push({ path: f.path, mode: "100644", type: "blob", content: f.text });
        }
      }
      const tree = await this.api("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: base.tree.sha, tree: entries }) });
      const commit = await this.api("/git/commits", {
        method: "POST",
        body: JSON.stringify({ message, tree: tree.sha, parents: [head], author: { name: author, email: "admin@ckhaven.invalid", date: new Date().toISOString() } }),
      });
      try {
        await this.api(`/git/refs/heads/${this.branch}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) });
        return commit.sha;
      } catch (e) {
        if (e.gh !== 422) throw e; // branch moved underneath us (e.g. the calendar bot); retry on the new head
      }
    }
    throw Object.assign(new Error("The site is busy saving another change. Try again in a few seconds."), { status: 409 });
  }

  /** Recent commits that touched `path`: [{ sha, message, author, date }]. */
  async history(path, limit = 20) {
    const list = await this.api(`/commits?sha=${encodeURIComponent(this.branch)}&path=${encodeURIComponent(path)}&per_page=${limit}`);
    return list.map((c) => ({ sha: c.sha, message: c.commit.message.split("\n")[0], author: c.commit.author.name, date: c.commit.author.date }));
  }
}
