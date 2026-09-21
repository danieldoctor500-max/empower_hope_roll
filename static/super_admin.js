"use strict";

async function requestJson(url, options = {}) {
    try {
        const response = await fetch(url, { credentials: "same-origin", ...options });
        const data = await response.json().catch(() => ({}));
        return { response, data };
    } catch (error) {
        return { response: null, data: { error: "Network error. Please try again." } };
    }
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function requireSuperAdmin() {
    const { response, data } = await requestJson("/api/me");
    if (!response || !response.ok) {
        window.location.href = "/";
        return false;
    }
    if (!data.user || data.user.role !== "super_admin") {
        window.location.href = "/dashboard";
        return false;
    }
    return true;
}

async function loadOverview() {
    const { data } = await requestJson("/api/super-admin/overview");
    const statKeys = {
        students: "student",
        staff: "staff",
        admins: "admin",
        "super-admins": "super_admin",
        pending: "pending",
    };
    Object.entries(statKeys).forEach(([name, key]) => {
        const element = document.getElementById(`stat-${name}`);
        if (element) element.textContent = data[key] ?? 0;
    });
}

async function loadUsers() {
    const { response, data } = await requestJson("/api/super-admin/users");
    const tbody = document.querySelector("#super-users-table tbody");
    if (!tbody) return;
    if (!response || !response.ok) {
        tbody.innerHTML = `<tr><td colspan="5">${escapeHtml(data.error || "Unable to load users.")}</td></tr>`;
        return;
    }
    tbody.innerHTML = data.map((user) => `<tr>
        <td>${escapeHtml(user.full_name)}</td>
        <td>${escapeHtml(user.username)}</td>
        <td>${escapeHtml(user.role)}</td>
        <td>${user.approved ? "Yes" : "No"}</td>
        <td><select data-user-id="${user.id}" class="super-role-select">
            ${["student", "staff", "admin", "super_admin"].map((role) => `<option value="${role}" ${user.role === role ? "selected" : ""}>${role}</option>`).join("")}
        </select></td>
    </tr>`).join("");
    tbody.querySelectorAll(".super-role-select").forEach((select) => {
        select.addEventListener("change", () => changeRole(select));
    });
}

async function changeRole(select) {
    const { response, data } = await requestJson(`/api/super-admin/set-role/${select.dataset.userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: select.value }),
    });
    if (!response || !response.ok) alert(data.error || "Unable to change role.");
    await loadOverview();
    await loadUsers();
}

async function loadAuditLog() {
    const { response, data } = await requestJson("/api/super-admin/audit-log");
    const tbody = document.querySelector("#super-audit-table tbody");
    if (!tbody) return;
    if (!response || !response.ok) {
        tbody.innerHTML = `<tr><td colspan="4">${escapeHtml(data.error || "Unable to load audit log.")}</td></tr>`;
        return;
    }
    tbody.innerHTML = data.map((row) => `<tr>
        <td>${escapeHtml(new Date(row.timestamp).toLocaleString())}</td>
        <td>${escapeHtml(row.actor_username || "system")}</td>
        <td>${escapeHtml(row.action)}</td>
        <td>${escapeHtml(row.target || "-")}</td>
    </tr>`).join("");
}

document.getElementById("create-admin-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { response, data } = await requestJson("/api/super-admin/create-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
    });
    const message = document.getElementById("admin-message");
    message.textContent = data.message || data.error || "";
    message.className = `message${response && response.ok ? " success" : ""}`;
    if (response && response.ok) {
        event.currentTarget.reset();
        await loadOverview();
        await loadUsers();
    }
});

document.getElementById("refresh-super-admin-btn")?.addEventListener("click", async () => {
    await loadOverview();
    await loadUsers();
    await loadAuditLog();
});

document.getElementById("logout-btn")?.addEventListener("click", async () => {
    await requestJson("/api/logout", { method: "POST" });
    window.location.href = "/";
});

(async function initialize() {
    if (!(await requireSuperAdmin())) return;
    await loadOverview();
    await loadUsers();
    await loadAuditLog();
})();