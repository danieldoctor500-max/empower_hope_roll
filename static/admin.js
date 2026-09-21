"use strict";


// ============================================================================
// HELPERS
// ============================================================================

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


async function requestJson(url, options = {}) {

    try {

        const response = await fetch(
            url,
            {
                credentials: "same-origin",
                ...options,
            }
        );

        const data =
            await response.json().catch(
                () => ({})
            );

        return {
            response,
            data,
        };

    } catch (error) {

        return {
            response: null,
            data: {
                error:
                    "Network error. Please try again."
            },
        };
    }
}


function setMessage(
    element,
    text,
    success = false
) {

    if (!element) return;

    element.textContent =
        text || "";

    element.className =
        "message" +
        (success ? " success" : "");
}


function setButtonLoading(
    button,
    loading,
    text
) {

    if (!button) return;

    if (loading) {

        button.dataset.originalText =
            button.textContent;

        button.disabled = true;

        button.textContent =
            text || "Please wait...";

    } else {

        button.disabled = false;

        button.textContent =
            button.dataset.originalText ||
            button.textContent;
    }
}


document.querySelectorAll("[data-jump-to]").forEach((button) => {
    button.addEventListener("click", () => {
        const target = document.getElementById(button.dataset.jumpTo);
        if (!target) return;

        target.scrollIntoView({ behavior: "smooth", block: "start" });
        window.setTimeout(() => target.focus({ preventScroll: true }), 350);
    });
});


// ============================================================================
// REQUIRE ADMIN
// ============================================================================

async function requireAdmin() {

    const {
        response,
        data
    } = await requestJson(
        "/api/me"
    );


    if (
        !response ||
        !response.ok
    ) {

        window.location.href = "/";

        return false;
    }


    if (
        !data.user ||
        !["admin", "super_admin"].includes(data.user.role)
    ) {

        alert(
            "Admin access only."
        );

        window.location.href =
            "/dashboard";

        return false;
    }


    return true;
}


// ============================================================================
// PENDING USERS
// ============================================================================

let pendingUserIds = new Set();
let pendingBaselineReady = false;


function updatePendingStat(users) {

    const stat =
        document.getElementById("stat-pending");

    if (stat) {
        stat.textContent = users.length;
    }
}


function updateUserStats(users) {

    const approvedCount =
        users.filter((user) => user.approved).length;

    const staffCount =
        users.filter(
            (user) =>
                user.role === "staff" ||
                user.role === "admin"
        ).length;

    const totalStat =
        document.getElementById("stat-total-users");

    const approvedStat =
        document.getElementById("stat-approved-users");

    const staffStat =
        document.getElementById("stat-staff-users");

    if (totalStat) totalStat.textContent = users.length;
    if (approvedStat) approvedStat.textContent = approvedCount;
    if (staffStat) staffStat.textContent = staffCount;
}


function notifyNewPendingUsers(users) {

    const newUsers =
        users.filter(
            (user) => !pendingUserIds.has(user.id)
        );

    if (!pendingBaselineReady || newUsers.length === 0) {
        return;
    }

    const notification =
        document.getElementById(
            "pending-notification"
        );

    if (notification) {
        notification.textContent =
            newUsers.length === 1
                ? "A new registration is waiting for approval."
                : `${newUsers.length} new registrations are waiting for approval.`;
        notification.className = "message success";
    }

    document.title = "New registration | Empower Hope";
}


function clearPendingNotification() {

    const notification =
        document.getElementById(
            "pending-notification"
        );

    if (notification) {
        notification.textContent = "";
        notification.className = "message";
    }

    document.title = "Admin | Empower Hope";
}


async function loadPending() {

    const {
        response,
        data
    } = await requestJson(
        "/api/admin/pending"
    );


    const tbody =
        document.querySelector(
            "#pending-table tbody"
        );


    if (!tbody) return;


    if (
        !response ||
        !response.ok
    ) {

        tbody.innerHTML =
            `<tr>
                <td colspan="4">
                    ${escapeHtml(
                        data.error ||
                        "Unable to load pending users."
                    )}
                </td>
            </tr>`;

        return;
    }


    const users =
        Array.isArray(data)
            ? data
            : [];

    updatePendingStat(users);

    notifyNewPendingUsers(users);

    pendingUserIds = new Set(
        users.map((user) => user.id)
    );

    pendingBaselineReady = true;


    if (users.length === 0) {

        tbody.innerHTML =
            `<tr>
                <td colspan="4">
                    No pending registrations.
                </td>
            </tr>`;

        return;
    }


    tbody.innerHTML =
        users
            .map(
                (user) =>
                    `<tr>

                        <td>
                            ${escapeHtml(
                                user.full_name
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                user.username
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                user.user_type
                            )}
                        </td>

                        <td>

                            <button
                                class="btn small"
                                data-action="approve"
                                data-id="${escapeHtml(
                                    user.id
                                )}"
                                type="button"
                            >
                                Approve
                            </button>

                            <button
                                class="btn small danger"
                                data-action="reject"
                                data-id="${escapeHtml(
                                    user.id
                                )}"
                                type="button"
                            >
                                Reject
                            </button>

                        </td>

                    </tr>`
            )
            .join("");


    tbody
        .querySelectorAll(
            "button[data-id]"
        )
        .forEach(
            (button) => {

                button.addEventListener(
                    "click",
                    () =>
                        processApproval(
                            button
                        )
                );
            }
        );
}


// ============================================================================
// APPROVE / REJECT
// ============================================================================

async function processApproval(button) {

    const id =
        button.dataset.id;

    const action =
        button.dataset.action;


    const actionName =
        action === "approve"
            ? "approve"
            : "reject";


    if (
        actionName === "reject" &&
        !confirm(
            "Reject this registration and remove the account?"
        )
    ) {

        return;
    }


    setButtonLoading(
        button,
        true,
        actionName === "approve"
            ? "Approving..."
            : "Rejecting..."
    );


    const {
        response,
        data
    } = await requestJson(
        `/api/admin/${actionName}/${id}`,
        {
            method: "POST",
        }
    );


    setMessage(
        document.getElementById(
            "pending-message"
        ),
        data.message ||
        data.error,
        Boolean(
            response &&
            response.ok
        )
    );


    if (
        response &&
        response.ok
    ) {

        clearPendingNotification();
        await loadPending();
        await loadUsers();
    }


    setButtonLoading(
        button,
        false
    );
}


// ============================================================================
// ALL USERS
// ============================================================================

async function loadUsers() {

    const {
        response,
        data
    } = await requestJson(
        "/api/admin/users"
    );


    const tbody =
        document.querySelector(
            "#users-table tbody"
        );


    if (!tbody) return;


    if (
        !response ||
        !response.ok
    ) {

        tbody.innerHTML =
            `<tr>
                <td colspan="7">
                    ${escapeHtml(
                        data.error ||
                        "Unable to load users."
                    )}
                </td>
            </tr>`;

        return;
    }


    const users =
        Array.isArray(data)
            ? data
            : [];

    updateUserStats(users);


    tbody.innerHTML =
        users
            .map(
                (user) =>
                    `<tr>

                        <td>
                            ${escapeHtml(
                                user.full_name
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                user.username
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                user.user_type
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                user.role
                            )}
                        </td>

                        <td>
                            ${
                                user.approved
                                    ? "Yes"
                                    : "No"
                            }
                        </td>

                        <td>

                            <select
                                data-id="${escapeHtml(
                                    user.id
                                )}"
                                class="role-select"
                            >

                                <option
                                    value="student"
                                    ${
                                        user.role ===
                                        "student"
                                            ? "selected"
                                            : ""
                                    }
                                >
                                    student
                                </option>

                                <option
                                    value="staff"
                                    ${
                                        user.role ===
                                        "staff"
                                            ? "selected"
                                            : ""
                                    }
                                >
                                    staff
                                </option>

                                <option
                                    value="admin"
                                    ${
                                        user.role ===
                                        "admin"
                                            ? "selected"
                                            : ""
                                    }
                                >
                                    admin
                                </option>

                            </select>

                        </td>

                        <td>

                            <button
                                class="btn small"
                                data-reset-id="${escapeHtml(
                                    user.id
                                )}"
                                data-reset-name="${escapeHtml(
                                    user.full_name
                                )}"
                                type="button"
                            >
                                Reset
                            </button>

                        </td>

                    </tr>`
            )
            .join("");


    tbody
        .querySelectorAll(
            ".role-select"
        )
        .forEach(
            (select) => {

                select.addEventListener(
                    "change",
                    () =>
                        changeRole(
                            select
                        )
                );
            }
        );


    tbody
        .querySelectorAll(
            "[data-reset-id]"
        )
        .forEach(
            (button) => {

                button.addEventListener(
                    "click",
                    () =>
                        resetPassword(
                            button
                        )
                );
            }
        );
}


// ============================================================================
// CHANGE ROLE
// ============================================================================

async function changeRole(select) {

    const id =
        select.dataset.id;

    const role =
        select.value;


    const {
        response,
        data
    } = await requestJson(
        `/api/admin/set-role/${id}`,
        {
            method: "POST",
            headers: {
                "Content-Type":
                    "application/json",
            },
            body: JSON.stringify({
                role,
            }),
        }
    );


    if (
        !response ||
        !response.ok
    ) {

        alert(
            data.error ||
            "Unable to change role."
        );

        await loadUsers();

        return;
    }


    await loadUsers();
}


// ============================================================================
// RESET PASSWORD
// ============================================================================

async function resetPassword(button) {

    const id =
        button.dataset.resetId;

    const name =
        button.dataset.resetName;


    const newPassword =
        prompt(
            `Enter a temporary password for ${name}.\n\nMinimum 8 characters:`
        );


    if (!newPassword) {
        return;
    }


    if (newPassword.length < 8) {

        alert(
            "Password must contain at least 8 characters."
        );

        return;
    }


    setButtonLoading(
        button,
        true,
        "Resetting..."
    );


    const {
        response,
        data
    } = await requestJson(
        `/api/admin/reset-password/${id}`,
        {
            method: "POST",
            headers: {
                "Content-Type":
                    "application/json",
            },
            body: JSON.stringify({
                new_password:
                    newPassword,
            }),
        }
    );


    setButtonLoading(
        button,
        false
    );


    alert(
        data.message ||
        data.error ||
        "Password reset completed."
    );
}


// ============================================================================
// CREATE STAFF
// ============================================================================

const createStaffForm =
    document.getElementById(
        "create-staff-form"
    );


if (createStaffForm) {

    createStaffForm.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();

            const button =
                createStaffForm.querySelector(
                    "button[type='submit']"
                );

            setButtonLoading(
                button,
                true,
                "Creating..."
            );

            const form =
                new FormData(
                    createStaffForm
                );


            const {
                response,
                data
            } = await requestJson(
                "/api/admin/create-staff",
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                    },
                    body: JSON.stringify(
                        Object.fromEntries(form)
                    ),
                }
            );


            setButtonLoading(
                button,
                false
            );


            setMessage(
                document.getElementById(
                    "staff-message"
                ),
                data.message ||
                data.error,
                Boolean(
                    response &&
                    response.ok
                )
            );


            if (
                response &&
                response.ok
            ) {

                createStaffForm.reset();

                await loadUsers();
            }
        }
    );
}


// ============================================================================
// AUDIT LOG
// ============================================================================

async function loadAuditLog() {

    const {
        response,
        data
    } = await requestJson(
        "/api/admin/audit-log"
    );


    const tbody =
        document.querySelector(
            "#audit-table tbody"
        );


    if (!tbody) return;


    if (
        !response ||
        !response.ok
    ) {

        tbody.innerHTML =
            `<tr>
                <td colspan="4">
                    ${escapeHtml(
                        data.error ||
                        "Unable to load audit log."
                    )}
                </td>
            </tr>`;

        return;
    }


    const rows =
        Array.isArray(data)
            ? data
            : [];


    if (rows.length === 0) {

        tbody.innerHTML =
            `<tr>
                <td colspan="4">
                    No audit records yet.
                </td>
            </tr>`;

        return;
    }


    tbody.innerHTML =
        rows
            .map(
                (row) =>
                    `<tr>

                        <td>
                            ${escapeHtml(
                                new Date(
                                    row.timestamp
                                ).toLocaleString()
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                row.actor_username ||
                                "system"
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                row.action
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                row.target ||
                                "-"
                            )}
                        </td>

                    </tr>`
            )
            .join("");
}


// ============================================================================
// LOGOUT
// ============================================================================

const logoutButton =
    document.getElementById(
        "logout-btn"
    );


if (logoutButton) {

    logoutButton.addEventListener(
        "click",
        async () => {

            setButtonLoading(
                logoutButton,
                true,
                "Logging out..."
            );

            await requestJson(
                "/api/logout",
                {
                    method: "POST",
                }
            );

            window.location.href =
                "/";
        }
    );
}


// ============================================================================
// FAB - CREATE STAFF
// ============================================================================

const createStaffFab =
    document.getElementById(
        "fab-create-staff"
    );


if (createStaffFab) {

    createStaffFab.addEventListener(
        "click",
        () => {

            const formCard =
                document.getElementById(
                    "create-staff-form-card"
                );

            if (!formCard) return;

            formCard.scrollIntoView({
                behavior: "smooth",
                block: "center",
            });


            const firstInput =
                formCard.querySelector(
                    "input"
                );

            if (firstInput) {
                setTimeout(
                    () => firstInput.focus(),
                    400
                );
            }
        }
    );
}


// ============================================================================
// REFRESH
// ============================================================================

const refreshAdminButton =
    document.getElementById(
        "refresh-admin-btn"
    );


async function refreshAdminData() {

    if (refreshAdminButton) {
        setButtonLoading(
            refreshAdminButton,
            true,
            "Refreshing..."
        );
    }

    await Promise.all([
        loadPending(),
        loadUsers(),
        loadAuditLog(),
    ]);

    if (refreshAdminButton) {
        setButtonLoading(
            refreshAdminButton,
            false
        );
    }
}


if (refreshAdminButton) {

    refreshAdminButton.addEventListener(
        "click",
        refreshAdminData
    );
}


// ============================================================================
// INITIALIZATION
// ============================================================================

async function initializeAdmin() {

    const authorized =
        await requireAdmin();

    if (!authorized) {
        return;
    }

    await refreshAdminData();

    window.setInterval(
        loadPending,
        10000
    );
}


initializeAdmin();