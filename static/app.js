"use strict";

const messageEl = document.getElementById("message");


function showMessage(text, isSuccess = false) {
    messageEl.textContent = text || "";
    messageEl.className =
        "message" + (isSuccess ? " success" : "");
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

    if (selectedType.value === "Student") {

        classLabel.style.display = "block";
        classSelect.required = true;

    } else {

        classLabel.style.display = "block";
        classSelect.required = false;
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

                return;
            }

            showMessage(
                data.error ||
                "Registration failed."
            );
        }
    );
}