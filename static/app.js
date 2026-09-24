"use strict";

const messageEl = document.getElementById("message");

const initialAuthCard = document.getElementById("auth-card");
if (initialAuthCard) {
    initialAuthCard.classList.add("is-register");
}


function showMessage(text, isSuccess = false) {
    if (!messageEl) return;

    messageEl.textContent = text || "";
    messageEl.className =
        "message" + (isSuccess ? " success" : "");
}


const googleStatus = {
    unavailable: "Google sign-in is not configured on this server.",
    invalid: "Google sign-in did not return a valid account.",
    pending: "Your account is waiting for administrator approval.",
};

const googleResult = new URLSearchParams(window.location.search).get("google");
if (googleResult && googleStatus[googleResult]) {
    showMessage(googleStatus[googleResult]);
}


function setButtonLoading(button, loading, text) {
    if (!button) return;

    if (loading) {
        button.dataset.originalText = button.textContent;
        button.disabled = true;
        button.textContent = text || "Please wait...";
    } else {
        button.disabled = false;
        button.textContent =
            button.dataset.originalText ||
            button.textContent;
    }
}


async function getJson(url, options = {}) {

    try {

        const response = await fetch(url, {
            credentials: "same-origin",
            ...options,
        });

        const data =
            await response.json().catch(() => ({}));

        return {
            response,
            data,
        };

    } catch (error) {

        return {
            response: null,
            data: {
                error: "Network error. Please try again."
            }
        };
    }
}


// ============================================================================
// TABS
// ============================================================================

document.querySelectorAll(".tab-btn").forEach((button) => {

    button.addEventListener("click", () => {

        const tabName = button.dataset.tab;

        if (!tabName) return;

        const authCard = document.getElementById("auth-card");

        if (authCard) {
            authCard.classList.toggle(
                "is-register",
                tabName === "register"
            );
        }

        document
            .querySelectorAll(".tab-btn")
            .forEach((btn) => {
                btn.classList.remove("active");
            });

        document
            .querySelectorAll(".tab-panel")
            .forEach((panel) => {
                panel.classList.remove("active");
            });

        button.classList.add("active");

        const panel =
            document.getElementById(
                `${tabName}-tab`
            );

        if (panel) {
            panel.classList.add("active");
        }

        showMessage("");
    });

});


// ============================================================================
// LOAD CLASSES
// ============================================================================

async function loadClasses() {

    const select =
        document.getElementById("class-select");

    if (!select) return;

    select.innerHTML =
        `<option value="">Loading classes...</option>`;

    const { response, data } =
        await getJson("/api/classes");

    if (!response || !response.ok) {

        select.innerHTML =
            `<option value="">Unable to load classes</option>`;

        return;
    }

    if (!Array.isArray(data)) {

        select.innerHTML =
            `<option value="">No classes available</option>`;

        return;
    }

    if (data.length === 0) {

        select.innerHTML =
            `<option value="">No classes available</option>`;

        return;
    }

    select.innerHTML =
        `<option value="">Select a class</option>` +
        data
            .map(
                (item) =>
                    `<option value="${escapeHtml(item.id)}">
                        ${escapeHtml(item.name)}
                    </option>`
            )
            .join("");
}


function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


loadClasses();


// ============================================================================
// USER TYPE
// ============================================================================

const classLabel =
    document.getElementById(
        "registration-class-label"
    );

const classSelect =
    document.getElementById("class-select");

const registrationTypeInputs =
    document.querySelectorAll(
        "#register-form input[name='user_type']"
    );


function updateRegistrationFields() {

    const selectedType =
        document.querySelector(
            "#register-form input[name='user_type']:checked"
        );

    if (!selectedType) return;

    const studentNumberLabel =
        document.getElementById("student-number-label");

    const studentNumberInput =
        document.querySelector(
            "#register-form input[name='student_number']"
        );

    if (selectedType.value === "Student") {

        classLabel.style.display = "block";
        classSelect.required = true;
        studentNumberLabel.style.display = "block";
        studentNumberInput.required = true;

    } else {

        classLabel.style.display = "block";
        classSelect.required = false;
        studentNumberLabel.style.display = "none";
        studentNumberInput.required = false;
        studentNumberInput.value = "";
    }
}


registrationTypeInputs.forEach((input) => {

    input.addEventListener(
        "change",
        updateRegistrationFields
    );
});

updateRegistrationFields();


// ============================================================================
// LOGIN
// ============================================================================

const loginForm =
    document.getElementById("login-form");

const loginIdentifierLabel =
    document.getElementById("login-identifier-label");

const loginIdentifierInput =
    document.getElementById("login-identifier");

const loginTypeInputs =
    document.querySelectorAll("#login-form input[name='user_type']");

function updateLoginIdentifier() {
    const selectedType = document.querySelector(
        "#login-form input[name='user_type']:checked"
    );
    const isStudent = selectedType?.value === "Student";

    if (loginIdentifierLabel) {
        loginIdentifierLabel.firstChild.textContent = isStudent
            ? "Student ID / Admission number"
            : "Username";
    }

    if (loginIdentifierInput) {
        loginIdentifierInput.autocomplete = isStudent
            ? "off"
            : "username";
    }
}

loginTypeInputs.forEach((input) => {
    input.addEventListener("change", updateLoginIdentifier);
});

updateLoginIdentifier();


if (loginForm) {

    loginForm.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();

            const button =
                loginForm.querySelector(
                    "button[type='submit']"
                );

            setButtonLoading(
                button,
                true,
                "Logging in..."
            );

            const form =
                new FormData(loginForm);

            const { response, data } =
                await getJson(
                    "/api/login",
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

            if (response && response.ok) {

                window.location.href =
                    data.user && data.user.role === "super_admin"
                        ? "/super-admin"
                        : data.user && data.user.role === "admin"
                            ? "/admin"
                            : data.user && data.user.role === "staff"
                                ? "/staff"
                                : data.user && data.user.role === "facilitator"
                                    ? "/facilitator"
                                    : "/dashboard";

                return;
            }

            showMessage(
                data.error ||
                "Login failed."
            );
        }
    );
}


// ============================================================================
// REGISTER
// ============================================================================

const registerForm =
    document.getElementById("register-form");


if (registerForm) {

    registerForm.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();

            const button =
                registerForm.querySelector(
                    "button[type='submit']"
                );

            setButtonLoading(
                button,
                true,
                "Submitting..."
            );

            const form =
                new FormData(registerForm);

            const { response, data } =
                await getJson(
                    "/api/register",
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

            if (response && response.ok) {

                showMessage(
                    data.message ||
                    "Registration submitted.",
                    true
                );

                registerForm.reset();

                updateRegistrationFields();

                document.querySelector(
                    ".tab-btn[data-tab='login']"
                )?.click();

                return;
            }

            showMessage(
                data.error ||
                "Registration failed."
            );
        }
    );
}

const forgotPasswordForm = document.getElementById("forgot-password-form");
const forgotPasswordLink = document.querySelector(".forgot-link");
if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener("click", (event) => {
        event.preventDefault();
        const recoveryCard = document.getElementById("forgot-password");
        const emailInput = forgotPasswordForm?.querySelector("input[name='email']");
        recoveryCard?.scrollIntoView({ behavior: "smooth", block: "start" });
        emailInput?.focus({ preventScroll: true });
    });
}

if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const result = await getJson("/api/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(new FormData(forgotPasswordForm))),
        });
        const message = document.getElementById("forgot-message");
        if (message) {
            message.textContent = result.data.reset_url
                ? `${result.data.message} Local reset link: ${result.data.reset_url}`
                : (result.data.message || result.data.error || "Request failed.");
            message.className = "message" + (result.response && result.response.ok ? " success" : "");
        }
    });
}

const resetPasswordForm = document.getElementById("reset-password-form");
if (resetPasswordForm) {
    resetPasswordForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const result = await getJson("/api/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(new FormData(resetPasswordForm))),
        });
        const message = document.getElementById("reset-message");
        if (message) {
            message.textContent = result.data.message || result.data.error || "Request failed.";
            message.className = "message" + (result.response && result.response.ok ? " success" : "");
            if (result.response && result.response.ok) {
                resetPasswordForm.reset();
                setTimeout(() => { window.location.href = "/"; }, 1200);
            }
        }
    });
}