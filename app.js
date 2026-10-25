(function () {
  "use strict";

  const INITIAL_ORGANIZATIONS = [
    { id: "org-acme", name: "Acme Finance" },
    { id: "org-northstar", name: "Northstar Health" }
  ];

  const INITIAL_USERS = [
    { id: "user-admin", name: "Asha Admin", organizationId: "org-acme", role: "Admin" },
    { id: "user-manager", name: "Ravi Manager", organizationId: "org-acme", role: "Manager" },
    { id: "user-viewer", name: "Maya Viewer", organizationId: "org-acme", role: "Viewer" },
    { id: "user-other-company", name: "Noah OtherCo", organizationId: "org-northstar", role: "Admin" }
  ];

  const INITIAL_DOCUMENTS = [
    {
      id: "doc-welcome",
      organizationId: "org-acme",
      ownerId: "user-admin",
      name: "Welcome.pdf",
      contentType: "application/pdf",
      createdAt: new Date().toISOString(),
      shares: [{ userId: "user-viewer", permission: "view" }]
    }
  ];

  function getStored(key, fallback) {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }

  function setStored(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function initData(reset = false) {
    if (reset || !localStorage.getItem("tv_initialized")) {
      setStored("tv_organizations", INITIAL_ORGANIZATIONS);
      setStored("tv_users", INITIAL_USERS);
      setStored("tv_documents", INITIAL_DOCUMENTS);
      setStored("tv_auditLogs", []);
      setStored("tv_initialized", true);
    }
  }

  initData();

  function getOrganizations() { return getStored("tv_organizations", INITIAL_ORGANIZATIONS); }
  function getUsers() { return getStored("tv_users", INITIAL_USERS); }
  function getDocuments() { return getStored("tv_documents", INITIAL_DOCUMENTS); }
  function getAuditLogs() { return getStored("tv_auditLogs", []); }

  function addAuditLog({ actorId, organizationId, action, documentId = null, outcome = "success", details = "" }) {
    const logs = getAuditLogs();
    logs.unshift({
      id: "log-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
      actorId,
      organizationId,
      action,
      documentId,
      outcome,
      details,
      timestamp: new Date().toISOString()
    });
    setStored("tv_auditLogs", logs);
  }

  function findUser(userId) {
    return getUsers().find((u) => u.id === userId) || null;
  }

  function findDocument(docId) {
    return getDocuments().find((d) => d.id === docId) || null;
  }

  function canReadDocument(user, doc) {
    if (!user || !doc) return false;
    const sameOrg = user.organizationId === doc.organizationId;
    if (sameOrg && (doc.ownerId === user.id || user.role === "Admin" || user.role === "Manager")) {
      return true;
    }
    return doc.shares.some(
      (s) => s.userId === user.id && (s.permission === "view" || s.permission === "edit")
    );
  }

  function canManageDocument(user, doc) {
    return Boolean(
      user &&
      doc &&
      user.organizationId === doc.organizationId &&
      (user.role === "Admin" || doc.ownerId === user.id || user.role === "Manager")
    );
  }

  const $ = (id) => document.getElementById(id);
  const getSelectedUser = () => findUser($("userSelect").value);

  const esc = (value) =>
    String(value).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));

  function showMessage(text, isError = false) {
    const msgEl = $("message");
    msgEl.textContent = text;
    msgEl.style.color = isError ? "#b42318" : "#187443";
  }

  function renderDashboard() {
    const user = getSelectedUser();
    if (!user) {
      showMessage("Select a valid demo user.", true);
      return;
    }

    const orgs = getOrganizations();
    const docs = getDocuments();
    const logs = getAuditLogs();

    const org = orgs.find((o) => o.id === user.organizationId);
    const visibleDocs = docs.filter((d) => canReadDocument(user, d));
    const userOrgLogs = logs.filter((l) => l.organizationId === user.organizationId);

    $("docCount").textContent = visibleDocs.length;
    $("orgName").textContent = org ? org.name : "-";
    $("auditCount").textContent = userOrgLogs.length;

    $("documents").innerHTML = visibleDocs.length
      ? visibleDocs.map((doc) => `
          <div class="doc">
            <div>
              <strong>📄 ${esc(doc.name)}</strong>
              <small>Owner: ${esc(doc.ownerId)} • ${esc(new Date(doc.createdAt).toLocaleString())}</small>
            </div>
            <div class="actions">
              <button class="secondary" data-action="view" data-id="${esc(doc.id)}">View</button>
              <button class="secondary" data-action="share" data-id="${esc(doc.id)}">Share</button>
            </div>
          </div>
        `).join("")
      : '<p class="muted">No documents visible to this user.</p>';

    $("auditLogs").innerHTML = userOrgLogs.length
      ? userOrgLogs.slice(0, 12).map((log) => `
          <div class="audit-row">
            <strong>${esc(log.action)} • ${esc(log.outcome)}</strong>
            <span>${esc(log.actorId)} • ${esc(new Date(log.timestamp).toLocaleString())}</span>
            <div class="muted">${esc(log.details || log.documentId || "")}</div>
          </div>
        `).join("")
      : '<p class="muted">No audit events yet.</p>';
  }

  function handleCreateDocument(e) {
    e.preventDefault();
    const user = getSelectedUser();
    if (!["Admin", "Manager"].includes(user.role)) {
      addAuditLog({
        actorId: user.id,
        organizationId: user.organizationId,
        action: "document.create",
        outcome: "denied"
      });
      showMessage("Only Admins and Managers can create documents.", true);
      renderDashboard();
      return;
    }

    const name = $("docName").value.trim();
    const contentType = $("contentType").value;

    if (!name || name.length > 120 || /[\\/]/.test(name)) {
      showMessage("Provide a valid document name (no slashes, max 120 chars).", true);
      return;
    }

    const docs = getDocuments();
    const newDoc = {
      id: "doc-" + Date.now(),
      organizationId: user.organizationId,
      ownerId: user.id,
      name,
      contentType,
      createdAt: new Date().toISOString(),
      shares: []
    };

    docs.unshift(newDoc);
    setStored("tv_documents", docs);

    addAuditLog({
      actorId: user.id,
      organizationId: user.organizationId,
      action: "document.create",
      documentId: newDoc.id,
      details: `Created metadata for ${newDoc.name}`
    });

    $("docName").value = "";
    showMessage("Document metadata created successfully.");
    renderDashboard();
  }

  function handleView(docId) {
    const user = getSelectedUser();
    const doc = findDocument(docId);
    if (!doc || !canReadDocument(user, doc)) {
      addAuditLog({
        actorId: user.id,
        organizationId: user.organizationId,
        action: "document.read",
        documentId: docId,
        outcome: "denied",
        details: "Document not found or access denied"
      });
      showMessage("Document not found or access denied.", true);
      renderDashboard();
      return;
    }

    addAuditLog({
      actorId: user.id,
      organizationId: doc.organizationId,
      action: "document.read",
      documentId: doc.id,
      details: `Read metadata for ${doc.name}`
    });
    showMessage(`Access granted to metadata for "${doc.name}". No file bytes stored in this demo.`);
    renderDashboard();
  }

  function handleShare(docId) {
    const user = getSelectedUser();
    const doc = findDocument(docId);

    if (!doc || !canManageDocument(user, doc)) {
      addAuditLog({
        actorId: user.id,
        organizationId: user.organizationId,
        action: "document.share",
        documentId: docId,
        outcome: "denied"
      });
      showMessage("You do not have permission to manage sharing for this document.", true);
      renderDashboard();
      return;
    }

    const recipientId = prompt("Share with user ID:\n• user-admin\n• user-manager\n• user-viewer\n• user-other-company");
    if (!recipientId) return;

    const recipient = findUser(recipientId.trim());
    if (!recipient || recipient.organizationId !== doc.organizationId) {
      addAuditLog({
        actorId: user.id,
        organizationId: user.organizationId,
        action: "document.share",
        documentId: doc.id,
        outcome: "denied",
        details: "Cross-organization or unknown recipient"
      });
      showMessage("Recipient must belong to the same organization.", true);
      renderDashboard();
      return;
    }

    const permission = prompt("Permission level: enter 'view' or 'edit'", "view");
    if (!permission || !["view", "edit"].includes(permission.trim().toLowerCase())) {
      showMessage("Permission must be either 'view' or 'edit'.", true);
      return;
    }

    const perm = permission.trim().toLowerCase();
    const docs = getDocuments();
    const targetDoc = docs.find((d) => d.id === docId);

    const existingShare = targetDoc.shares.find((s) => s.userId === recipient.id);
    if (existingShare) {
      existingShare.permission = perm;
    } else {
      targetDoc.shares.push({ userId: recipient.id, permission: perm });
    }

    setStored("tv_documents", docs);

    addAuditLog({
      actorId: user.id,
      organizationId: targetDoc.organizationId,
      action: "document.share",
      documentId: targetDoc.id,
      details: `Shared ${targetDoc.name} with ${recipient.id} (${perm})`
    });

    showMessage(`Document successfully shared with ${recipient.name}.`);
    renderDashboard();
  }

  $("uploadForm").addEventListener("submit", handleCreateDocument);
  $("userSelect").addEventListener("change", () => {
    showMessage("");
    renderDashboard();
  });
  $("refreshBtn").addEventListener("click", () => {
    showMessage("Dashboard refreshed.");
    renderDashboard();
  });
  $("resetDataBtn").addEventListener("click", () => {
    if (confirm("Reset all documents and audit logs back to initial state?")) {
      initData(true);
      showMessage("Demo data reset.");
      renderDashboard();
    }
  });

  $("documents").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const action = btn.dataset.action;
    const docId = btn.dataset.id;
    if (action === "view") handleView(docId);
    if (action === "share") handleShare(docId);
  });

  renderDashboard();
})();