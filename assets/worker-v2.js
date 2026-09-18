/* worker-v2.js — muse-invite V2 前端接入
 *
 * 数据优先从 Cloudflare Worker 拉取（GET /api/codes，含投票数/剩余次数/认领状态），
 * worker 不可用或尚未部署时自动回退到本站 /data/codes.json（离线模式：只读目录）。
 *
 * 部署步骤（总协调员）：把下面 WORKER_URL 的占位符替换为 deploy.sh 输出的真实域名。
 */
(function () {
  "use strict";

  // ★ 部署后替换，例如 "https://muse-invite-v2.xxx.workers.dev"（不要末尾斜杠）
  var WORKER_URL = "WORKER_URL_PLACEHOLDER";
  var workerReady = WORKER_URL.indexOf("WORKER_URL_PLACEHOLDER") === -1;

  var STATUS_LABEL = { unverified: "待验证", working: "有人反馈可用", review: "失效复核中", retired: "已下架" };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  }

  function api(path, opts) {
    return fetch(WORKER_URL + path, opts).then(function (r) {
      return r.json().then(function (d) { return { status: r.status, data: d }; });
    });
  }

  function loadLocal() {
    return fetch("/data/codes.json").then(function (r) { return r.json(); }).then(function (d) {
      var codes = (d.codes || []).map(function (c) {
        c.votes_works = 0; c.votes_dead = 0; c.claimed = false;
        return c;
      });
      return { codes: codes, live: false };
    });
  }

  function loadCodes() {
    if (workerReady) {
      return api("/api/codes").then(function (res) {
        if (res.status === 200 && res.data && res.data.codes) return { codes: res.data.codes, live: true };
        throw new Error("worker bad response: " + res.status);
      }).catch(function () { return loadLocal(); });
    }
    return loadLocal();
  }

  // 众包信号叠加：多人反馈失效且明显多于"还能用"时，前端提示复核中
  function statusOf(c) {
    var w = c.votes_works || 0, d = c.votes_dead || 0;
    if (d >= 3 && d > w * 2) return { k: "review", label: "⚠️ 多人反馈失效" };
    var k = c.status || "unverified";
    return { k: k, label: c.status_label || STATUS_LABEL[k] || "待验证" };
  }

  function flash(btn, msg) {
    var card = btn.closest(".card");
    var box = card ? card.querySelector(".vote-msg") : null;
    if (box) { box.textContent = msg; return; }
    alert(msg);
  }

  function doVote(btn) {
    if (!workerReady) { flash(btn, "投票服务尚未启用"); return; }
    var card = btn.closest(".card");
    var code = card.dataset.code;
    btn.disabled = true;
    api("/api/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code, verdict: btn.getAttribute("data-vote") })
    }).then(function (res) {
      if (res.status === 200 && res.data && res.data.ok) {
        card.querySelector(".vw").textContent = res.data.votes_works;
        card.querySelector(".vd").textContent = res.data.votes_dead;
        flash(btn, "投票成功，谢谢反馈！");
      } else if (res.status === 429) {
        flash(btn, "24 小时内已投过票，请稍后再试");
      } else {
        flash(btn, "投票失败：" + ((res.data && res.data.error) || ("HTTP " + res.status)));
      }
    }).catch(function () {
      flash(btn, "网络错误，请稍后重试");
    }).then(function () { btn.disabled = false; });
  }

  function doClaim(btn) {
    if (!workerReady) { flash(btn, "认领服务尚未启用"); return; }
    var card = btn.closest(".card");
    var code = card.dataset.code;
    if (!window.confirm("认领邀请码 " + code + "？\n认领后你将获得 owner_key，可自助更新剩余次数。")) return;
    btn.disabled = true;
    api("/api/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code })
    }).then(function (res) {
      var box = document.getElementById("claim-result");
      box.hidden = false;
      if (res.status === 200 && res.data && res.data.ok) {
        box.innerHTML = "✅ <b>" + esc(code) + "</b> 认领成功！你的 owner_key（<b>只显示一次</b>，请立即复制保存）：<br>" +
          "<code class=\"owner-key\">" + esc(res.data.owner_key) + "</code><br>" +
          "<span class=\"muted\">丢失后无法找回。请用它在下方「码主自助更新」里更新剩余次数。</span>";
        btn.remove();
      } else if (res.status === 409) {
        box.textContent = "该码已被认领。如你是码主但丢失了 owner_key，请联系站主重置。";
      } else if (res.status === 429) {
        box.textContent = "认领过于频繁，请 24 小时后再试。";
      } else {
        box.textContent = "认领失败：" + ((res.data && res.data.error) || ("HTTP " + res.status));
      }
      box.scrollIntoView({ behavior: "smooth", block: "center" });
    }).catch(function () {
      var box = document.getElementById("claim-result");
      box.hidden = false;
      box.textContent = "网络错误，请稍后重试";
    }).then(function () { btn.disabled = false; });
  }

  function render(codes) {
    var wrap = document.getElementById("cards");
    wrap.innerHTML = "";
    codes.forEach(function (c) {
      var st = statusOf(c);
      var a = document.createElement("article");
      a.className = "card";
      a.dataset.status = st.k;
      a.dataset.added = c.added_at || "";
      a.dataset.verified = c.last_verified || "";
      a.dataset.code = c.code;
      var remainingTxt = (c.remaining === null || c.remaining === undefined)
        ? "未知" : ("<b>" + esc(c.remaining) + "</b>");
      var inviteUrl = c.invite_url || ("https://agent.meta.ai/invite/" + c.code);
      a.innerHTML =
        '<div class="code">' + esc(c.code) + "</div>" +
        '<span class="st st-' + esc(st.k) + '">' + esc(st.label) + "</span>" +
        '<div class="meta">来源：<b>' + esc(c.source_label || c.publisher || "未知") + "</b>" +
        (c.total_slots ? " · 总名额 " + esc(c.total_slots) : "") +
        "<br>剩余次数：" + remainingTxt +
        (c.claimed ? ' · <span class="claimed-tag">已认领</span>' : "") +
        "<br>最后验证：<b>" + esc(c.last_verified || "尚未验证") + "</b></div>" +
        '<div class="votes">' +
        '👍 <b class="vw">' + (c.votes_works || 0) + '</b> ' +
        '<button class="btn small ghost" data-vote="works">还能用</button> ' +
        '👎 <b class="vd">' + (c.votes_dead || 0) + '</b> ' +
        '<button class="btn small ghost" data-vote="dead">已失效</button>' +
        '<span class="vote-msg"></span>' +
        "</div>" +
        '<div class="actions">' +
        '<a class="btn small" target="_blank" rel="noopener" href="' + esc(inviteUrl) + '">去兑换 →</a> ' +
        '<a class="btn small ghost" href="/codes/' + esc(c.code) + '.html">详情</a>' +
        (workerReady && !c.claimed ? ' <button class="btn small ghost" data-claim>我是码主，认领</button>' : "") +
        "</div>";
      wrap.appendChild(a);
    });
    applyFilter();
    document.getElementById("stat-total").textContent = codes.length;
  }

  function applyFilter() {
    var cards = [].slice.call(document.querySelectorAll("#cards .card"));
    var fs = document.getElementById("f-status"),
        so = document.getElementById("f-sort"),
        empty = document.getElementById("empty");
    if (!fs || !so) return;
    var list = cards.filter(function (c) { return !fs.value || c.dataset.status === fs.value; });
    list.sort(function (a, b) {
      if (so.value === "code_asc") return a.dataset.code.localeCompare(b.dataset.code);
      if (so.value === "verified_desc") return (b.dataset.verified || "").localeCompare(a.dataset.verified || "");
      return (b.dataset.added || "").localeCompare(a.dataset.added || "");
    });
    cards.forEach(function (c) { c.style.display = "none"; });
    list.forEach(function (c) { c.style.display = ""; });
    empty.hidden = list.length > 0;
  }

  function bindOwnerForm() {
    var btn = document.getElementById("o-submit");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var msg = document.getElementById("owner-msg");
      var code = document.getElementById("o-code").value.trim().toUpperCase();
      var key = document.getElementById("o-key").value.trim();
      var remaining = parseInt(document.getElementById("o-remaining").value, 10);
      if (!workerReady) { msg.textContent = "更新服务尚未启用（worker 未部署）。"; return; }
      if (!/^[A-Z0-9]{4,16}$/.test(code)) { msg.textContent = "请填写正确的邀请码。"; return; }
      if (!/^[0-9a-f]{64}$/i.test(key)) { msg.textContent = "owner_key 格式不正确（应为 64 位十六进制）。"; return; }
      if (!Number.isInteger(remaining) || remaining < 0) { msg.textContent = "剩余次数请填写 ≥0 的整数。"; return; }
      btn.disabled = true;
      msg.textContent = "提交中…";
      api("/api/owner-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code, owner_key: key, remaining: remaining })
      }).then(function (res) {
        if (res.status === 200 && res.data && res.data.ok) {
          msg.textContent = "✅ 更新成功：" + code + " 剩余次数 = " + res.data.remaining + "。刷新页面后生效。";
        } else if (res.status === 403) {
          msg.textContent = "更新失败：owner_key 不正确，或该码尚未认领。";
        } else {
          msg.textContent = "更新失败：" + ((res.data && res.data.error) || ("HTTP " + res.status));
        }
      }).catch(function () {
        msg.textContent = "网络错误，请稍后重试。";
      }).then(function () { btn.disabled = false; });
    });
  }

  function injectStyles() {
    var css = [
      ".votes{margin:10px 0 2px;font-size:14px;color:var(--muted)}",
      ".votes .btn{margin:0 2px}",
      ".vote-msg{margin-left:8px;color:var(--accent);font-size:13px}",
      ".claimed-tag{color:var(--green);font-size:12px;border:1px solid var(--border);border-radius:999px;padding:1px 8px}",
      ".owner-form{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0}",
      ".owner-form input{background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:8px 10px;font-size:14px}",
      "#o-code{width:130px}#o-key{flex:1;min-width:220px}#o-remaining{width:110px}",
      "#claim-result,#owner-msg{margin:10px 0;padding:10px 14px;border:1px solid var(--border);border-radius:10px;background:var(--card2);font-size:14px}",
      "#claim-result[hidden]{display:none}",
      ".owner-key{display:inline-block;margin:6px 0;padding:6px 10px;background:var(--bg);border:1px dashed var(--accent);border-radius:8px;word-break:break-all;user-select:all}",
      ".muted{color:var(--muted);font-size:13px}"
    ].join("\n");
    var s = document.createElement("style");
    s.textContent = css;
    document.head.appendChild(s);
  }

  function init() {
    injectStyles();
    bindOwnerForm();
    var fs = document.getElementById("f-status"), so = document.getElementById("f-sort");
    if (fs) fs.addEventListener("change", applyFilter);
    if (so) so.addEventListener("change", applyFilter);
    var wrap = document.getElementById("cards");
    wrap.addEventListener("click", function (e) {
      var vb = e.target.closest ? e.target.closest("[data-vote]") : null;
      if (vb) { doVote(vb); return; }
      var cb = e.target.closest ? e.target.closest("[data-claim]") : null;
      if (cb) doClaim(cb);
    });
    var badge = document.getElementById("v2-badge");
    loadCodes().then(function (r) {
      render(r.codes);
      if (badge) badge.textContent = r.live ? "🟢 实时投票服务已连接" : "🟡 离线模式（本地数据，投票不可用）";
    }).catch(function () {
      if (badge) badge.textContent = "🔴 数据加载失败";
      var empty = document.getElementById("empty");
      if (empty) { empty.hidden = false; empty.textContent = "数据加载失败，请刷新重试。"; }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
