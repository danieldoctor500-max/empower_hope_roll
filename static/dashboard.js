let me = null;
let classes = [];

// ============================================================
// API HELPER
// ============================================================

async function apiRequest(url, options = {}) {
    try {
        const response = await fetch(url, {
            credentials: "same-origin",
            ...options,
            headers: {
                ...(options.body
                    ? { "Content-Type": "application/json" }
                    : {}),
                ...(options.headers || {}),
            },
        });

        let data = {};

        try {
            data = await response.json();
        } catch (error) {
            data = {};
        }

        if (response.status === 401) {
            window.location.href = "/";
            return {
                ok: false,
                status: 401,
                data,
            };
        }

        return {
            ok: response.ok,
            status: response.status,
            data,
        };
    } catch (error) {
        console.error("API request failed:", error);

        return {
            ok: false,
            status: 0,
            data: {
                error: "Unable to connect to the server.",
            },
        };
    }
}


// ============================================================
// HELPERS
// ============================================================

function showMessage(elementId, text, success = false) {
    const element = document.getElementById(elementId);

    if (!element) return;

    element.textContent = text || "";
    element.className = "message" + (success ? " success" : "");
}


function todayString() {
    return new Date().toISOString().slice(0, 10);
}


function currentMonthString() {
    return new Date().toISOString().slice(0, 7);
}


function escapeHtml(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// ============================================================
// LOAD CURRENT USER
// ============================================================

async function loadMe() {
    const result = await apiRequest("/api/me");

    if (!result.ok) {
        window.location.href = "/";
        return;
    }

    me = result.data.user;

    const welcome = document.getElementById("welcome");

    if (welcome) {
        welcome.textContent =
            `${me.full_name} (${me.role})`;
    }

    // Admin navigation
    if (me.role === "admin") {
        const adminLink =
            document.getElementById("admin-link");

        const tabAdmin =
            document.getElementById("tab-admin");

        if (adminLink) {
            adminLink.style.display = "inline-flex";
        }

        if (tabAdmin) {
            tabAdmin.style.display = "flex";
        }
    }

    // Staff and admin sections
    if (me.role === "staff" || me.role === "admin") {
        document
            .querySelectorAll(".staff-only")
            .forEach((element) => {
                element.style.display = "block";
            });

        await loadStudents();
    }
}


// ============================================================
// LOAD CLASSES
// ============================================================

async function loadClasses() {
    const result = await apiRequest("/api/classes");

    if (!result.ok) {
        console.error(
            result.data.error || "Unable to load classes"
        );
        return;
    }

    classes = result.data;

    const options = classes
        .map(
            (c) => `
                <option value="${escapeHtml(c.id)}">
                    ${escapeHtml(c.name)}
                </option>
            `
        )
        .join("");

    // Sign in class
    const signSelect =
        document.getElementById("signclass-select");

    if (signSelect) {
        signSelect.innerHTML = options;
    }

    // Student filter
    const filterSelect =
        document.getElementById("class-filter");

    if (filterSelect) {
        filterSelect.innerHTML =
            `<option value="">All classes</option>` +
            options;
    }

    // Daily report class
    const dailyReportSelect =
        document.getElementById("report-daily-class");

    if (dailyReportSelect) {
        dailyReportSelect.innerHTML =
            `<option value="">All classes</option>` +
            options;
    }

    // Monthly report class
    const monthlyReportSelect =
        document.getElementById(
            "report-monthly-class"
        );

    if (monthlyReportSelect) {
        monthlyReportSelect.innerHTML =
            `<option value="">All classes</option>` +
            options;
    }
}


// ============================================================
// SIGN IN
// ============================================================

const signinButton =
    document.getElementById("signin-btn");

if (signinButton) {
    signinButton.addEventListener("click", async () => {
        const classSelect =
            document.getElementById("signclass-select");

        const class_id =
            classSelect ? classSelect.value : null;

        const result = await apiRequest("/api/signin", {
            method: "POST",
            body: JSON.stringify({
                class_id,
            }),
        });

        showMessage(
            "sign-message",
            result.data.message ||
                result.data.error,
            result.ok
        );
    });
}


// ============================================================
// SIGN OUT
// ============================================================

const signoutButton =
    document.getElementById("signout-btn");

if (signoutButton) {
    signoutButton.addEventListener("click", async () => {
        const result = await apiRequest("/api/signout", {
            method: "POST",
        });

        showMessage(
            "sign-message",
            result.data.message ||
                result.data.error,
            result.ok
        );
    });
}


// ============================================================
// ATTENDANCE DATE
// ============================================================

const dateInput =
    document.getElementById("attendance-date");

if (dateInput) {
    dateInput.value = todayString();
}


// ============================================================
// LOAD STUDENTS
// ============================================================

async function loadStudents() {
    const classFilter =
        document.getElementById("class-filter");

    const searchInput =
        document.getElementById("student-search");

    if (!classFilter) {
        return;
    }

    const classId = classFilter.value;

    const date =
        dateInput
            ? dateInput.value
            : todayString();

    let studentUrl = "/api/students";

    if (classId) {
        studentUrl +=
            `?class_id=${encodeURIComponent(classId)}`;
    }

    const studentResult =
        await apiRequest(studentUrl);

    if (!studentResult.ok) {
        showMessage(
            "attendance-message",
            studentResult.data.error ||
                "Unable to load students."
        );

        return;
    }

    const searchTerm = searchInput
        ? searchInput.value.trim().toLowerCase()
        : "";

    const students = studentResult.data.filter(
        (student) => {
            if (!searchTerm) return true;

            return [
                student.full_name,
                student.student_number,
            ].some((value) =>
                String(value || "")
                    .toLowerCase()
                    .includes(searchTerm)
            );
        }
    );

    let attendanceUrl =
        `/api/attendance?date=${encodeURIComponent(date)}`;

    if (classId) {
        attendanceUrl +=
            `&class_id=${encodeURIComponent(classId)}`;
    }

    const attendanceResult =
        await apiRequest(attendanceUrl);

    const attendance =
        attendanceResult.ok
            ? attendanceResult.data
            : [];

    const statusByStudent = {};

    attendance.forEach((record) => {
        statusByStudent[record.student_id] =
            record.status;
    });

    const tbody =
        document.querySelector(
            "#students-table tbody"
        );

    if (!tbody) {
        return;
    }

    if (!students.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4">
                    No approved students found.
                </td>
            </tr>
        `;

        return;
    }

    tbody.innerHTML = students
        .map((student) => {
            const status =
                statusByStudent[student.id] ||
                "Not marked";

            return `
                <tr>
                    <td>
                        ${escapeHtml(student.full_name)}
                    </td>

                    <td>
                        ${escapeHtml(
                            student.student_number || "-"
                        )}
                    </td>

                    <td class="status-${escapeHtml(status)}">
                        ${escapeHtml(status)}
                    </td>

                    <td>
                        <button
                            class="btn small"
                            data-id="${escapeHtml(student.id)}"
                            data-status="Present"
                        >
                            Present
                        </button>

                        <button
                            class="btn small"
                            data-id="${escapeHtml(student.id)}"
                            data-status="Absent"
                        >
                            Absent
                        </button>

                        <button
                            class="btn small"
                            data-id="${escapeHtml(student.id)}"
                            data-status="Late"
                        >
                            Late
                        </button>

                        <button
                            class="btn small"
                            data-id="${escapeHtml(student.id)}"
                            data-status="Excused"
                        >
                            Excused
                        </button>
                    </td>
                </tr>
            `;
        })
        .join("");

    // Attendance buttons
    tbody
        .querySelectorAll("button")
        .forEach((button) => {
            button.addEventListener(
                "click",
                async () => {
                    const studentId =
                        button.dataset.id;

                    const status =
                        button.dataset.status;

                    const student =
                        students.find(
                            (item) =>
                                String(item.id) ===
                                String(studentId)
                        );

                    const classIdForMark =
                        classId ||
                        (student
                            ? student.class_id
                            : null);

                    if (!classIdForMark) {
                        showMessage(
                            "attendance-message",
                            "Student is not assigned to a class."
                        );

                        return;
                    }

                    button.disabled = true;

                    const result =
                        await apiRequest(
                            "/api/attendance/mark",
                            {
                                method: "POST",
                                body: JSON.stringify({
                                    student_id:
                                        studentId,
                                    class_id:
                                        classIdForMark,
                                    date,
                                    status,
                                }),
                            }
                        );

                    showMessage(
                        "attendance-message",
                        result.data.message ||
                            result.data.error,
                        result.ok
                    );

                    button.disabled = false;

                    if (result.ok) {
                        await loadStudents();
                    }
                }
            );
        });
}


// ============================================================
// BULK ATTENDANCE
// ============================================================

const bulkAttendanceButton =
    document.getElementById("bulk-attendance-btn");

if (bulkAttendanceButton) {
    bulkAttendanceButton.addEventListener("click", async () => {
        const statusSelect =
            document.getElementById("bulk-attendance-status");

        const status = statusSelect ? statusSelect.value : "";
        const classId = classFilter ? classFilter.value : "";
        const date = dateInput ? dateInput.value : todayString();

        if (!status) {
            showMessage(
                "attendance-message",
                "Choose a bulk attendance status first."
            );
            return;
        }

        if (!classId) {
            showMessage(
                "attendance-message",
                "Choose a class before marking filtered students."
            );
            return;
        }

        const searchInput =
            document.getElementById("student-search");
        const searchTerm = searchInput
            ? searchInput.value.trim().toLowerCase()
            : "";

        const studentResult = await apiRequest(
            `/api/students?class_id=${encodeURIComponent(classId)}`
        );

        if (!studentResult.ok) {
            showMessage(
                "attendance-message",
                studentResult.data.error || "Unable to load students."
            );
            return;
        }

        const students = studentResult.data.filter((student) => {
            if (!searchTerm) return true;

            return [student.full_name, student.student_number].some(
                (value) => String(value || "")
                    .toLowerCase()
                    .includes(searchTerm)
            );
        });

        if (!students.length) {
            showMessage(
                "attendance-message",
                "No filtered students are available to mark."
            );
            return;
        }

        bulkAttendanceButton.disabled = true;
        let marked = 0;

        for (const student of students) {
            const result = await apiRequest(
                "/api/attendance/mark",
                {
                    method: "POST",
                    body: JSON.stringify({
                        student_id: student.id,
                        class_id: classId,
                        date,
                        status,
                    }),
                }
            );

            if (!result.ok) {
                showMessage(
                    "attendance-message",
                    result.data.error ||
                        `Marked ${marked} of ${students.length} students.`
                );
                bulkAttendanceButton.disabled = false;
                await loadStudents();
                return;
            }

            marked += 1;
        }

        bulkAttendanceButton.disabled = false;
        showMessage(
            "attendance-message",
            `${marked} filtered student${marked === 1 ? "" : "s"} marked ${status}.`,
            true
        );
        await loadStudents();
    });
}


// ============================================================
// ATTENDANCE FILTERS
// ============================================================

const classFilter =
    document.getElementById("class-filter");

if (classFilter) {
    classFilter.addEventListener(
        "change",
        loadStudents
    );
}

const studentSearch =
    document.getElementById("student-search");

if (studentSearch) {
    studentSearch.addEventListener(
        "input",
        loadStudents
    );
}

if (dateInput) {
    dateInput.addEventListener(
        "change",
        loadStudents
    );
}


// ============================================================
// CHANGE PASSWORD
// ============================================================

const changePasswordForm =
    document.getElementById(
        "change-password-form"
    );

if (changePasswordForm) {
    changePasswordForm.addEventListener(
        "submit",
        async (event) => {
            event.preventDefault();

            const form =
                new FormData(changePasswordForm);

            const result =
                await apiRequest(
                    "/api/change-password",
                    {
                        method: "POST",
                        body: JSON.stringify(
                            Object.fromEntries(form)
                        ),
                    }
                );

            showMessage(
                "password-message",
                result.data.message ||
                    result.data.error,
                result.ok
            );

            if (result.ok) {
                changePasswordForm.reset();
            }
        }
    );
}


// ============================================================
// DAILY REPORT
// ============================================================

async function runDailyReport() {
    const classSelect =
        document.getElementById(
            "report-daily-class"
        );

    const reportDate =
        document.getElementById(
            "report-daily-date"
        );

    const classId =
        classSelect
            ? classSelect.value
            : "";

    const date =
        reportDate
            ? reportDate.value
            : todayString();

    let url =
        `/api/reports/daily?date=${encodeURIComponent(date)}`;

    if (classId) {
        url +=
            `&class_id=${encodeURIComponent(classId)}`;
    }

    const result =
        await apiRequest(url);

    if (!result.ok) {
        showMessage(
            "report-daily-summary",
            result.data.error ||
                "Unable to generate report."
        );

        return;
    }

    const rows =
        result.data.records ||
        result.data;

    const tbody =
        document.querySelector(
            "#report-daily-table tbody"
        );

    if (!tbody) {
        return;
    }

    if (!rows.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4">
                    No attendance records found.
                </td>
            </tr>
        `;
    } else {
        tbody.innerHTML = rows
            .map(
                (row) => `
                    <tr>
                        <td>
                            ${escapeHtml(
                                row.class_name ||
                                row.class ||
                                "-"
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                row.full_name ||
                                row.student ||
                                "-"
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                row.student_number ||
                                "-"
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                row.status ||
                                "Not marked"
                            )}
                        </td>
                    </tr>
                `
            )
            .join("");
    }

    if (result.data.summary) {
        const summary =
            result.data.summary;

        const summaryElement =
            document.getElementById(
                "report-daily-summary"
            );

        if (summaryElement) {
            summaryElement.textContent =
                `Total: ${summary.total_students} | ` +
                `Present: ${summary.present} | ` +
                `Absent: ${summary.absent}`;
        }
    }
}


// ============================================================
// MONTHLY REPORT
// ============================================================

async function runMonthlyReport() {
    const classSelect =
        document.getElementById(
            "report-monthly-class"
        );

    const monthInput =
        document.getElementById(
            "report-monthly-month"
        );

    const classId =
        classSelect
            ? classSelect.value
            : "";

    const month =
        monthInput
            ? monthInput.value
            : currentMonthString();

    if (!month) {
        alert("Please select a month.");
        return;
    }

    let url =
        `/api/reports/monthly?month=${encodeURIComponent(month)}`;

    if (classId) {
        url +=
            `&class_id=${encodeURIComponent(classId)}`;
    }

    const result =
        await apiRequest(url);

    if (!result.ok) {
        alert(
            result.data.error ||
            "Unable to generate monthly report."
        );

        return;
    }

    const rows =
        result.data.records ||
        result.data;

    const tbody =
        document.querySelector(
            "#report-monthly-table tbody"
        );

    if (!tbody) {
        return;
    }

    if (!rows.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    No attendance records found.
                </td>
            </tr>
        `;

        return;
    }

    tbody.innerHTML = rows
        .map(
            (row) => `
                <tr>
                    <td>
                        ${escapeHtml(
                            row.class_name || "-"
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            row.full_name || "-"
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            row.present ?? 0
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            row.absent ?? 0
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            row.marked ?? 0
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            row.attendance_percentage ??
                            0
                        )}%
                    </td>
                </tr>
            `
        )
        .join("");
}


// ============================================================
// REPORT BUTTONS
// ============================================================

const dailyRun =
    document.getElementById(
        "report-daily-run"
    );

if (dailyRun) {
    dailyRun.addEventListener(
        "click",
        runDailyReport
    );
}


const monthlyRun =
    document.getElementById(
        "report-monthly-run"
    );

if (monthlyRun) {
    monthlyRun.addEventListener(
        "click",
        runMonthlyReport
    );
}


// ============================================================
// REPORT TABS
// ============================================================

document
    .querySelectorAll("[data-report-tab]")
    .forEach((button) => {
        button.addEventListener(
            "click",
            () => {
                const target =
                    button.dataset.reportTab;

                document
                    .querySelectorAll(
                        "[data-report-tab]"
                    )
                    .forEach((item) => {
                        item.classList.remove(
                            "active"
                        );
                    });

                document
                    .querySelectorAll(
                        ".tab-panel"
                    )
                    .forEach((panel) => {
                        panel.classList.remove(
                            "active"
                        );
                    });

                button.classList.add("active");

                const panel =
                    document.getElementById(
                        `${target}-report-tab`
                    );

                if (panel) {
                    panel.classList.add(
                        "active"
                    );
                }
            }
        );
    });


// ============================================================
// REPORT DATE DEFAULTS
// ============================================================

const dailyReportDate =
    document.getElementById(
        "report-daily-date"
    );

if (dailyReportDate) {
    dailyReportDate.value =
        todayString();
}


const monthlyReportMonth =
    document.getElementById(
        "report-monthly-month"
    );

if (monthlyReportMonth) {
    monthlyReportMonth.value =
        currentMonthString();
}


// ============================================================
// EXPORT LINKS
// ============================================================

function updateExportLinks() {
    const dailyClass =
        document.getElementById(
            "report-daily-class"
        );

    const dailyDate =
        document.getElementById(
            "report-daily-date"
        );

    const monthlyClass =
        document.getElementById(
            "report-monthly-class"
        );

    const monthlyMonth =
        document.getElementById(
            "report-monthly-month"
        );

    const dailyXlsx =
        document.getElementById(
            "report-daily-xlsx"
        );

    const dailyCsv =
        document.getElementById(
            "report-daily-csv"
        );

    const monthlyXlsx =
        document.getElementById(
            "report-monthly-xlsx"
        );

    const monthlyCsv =
        document.getElementById(
            "report-monthly-csv"
        );


    // Daily export
    if (
        dailyXlsx &&
        dailyCsv &&
        dailyDate
    ) {
        let query =
            `date=${encodeURIComponent(
                dailyDate.value
            )}`;

        if (
            dailyClass &&
            dailyClass.value
        ) {
            query +=
                `&class_id=${encodeURIComponent(
                    dailyClass.value
                )}`;
        }

        dailyXlsx.href =
            `/api/reports/daily/export.xlsx?${query}`;

        dailyCsv.href =
            `/api/reports/daily/export.csv?${query}`;
    }


    // Monthly export
    if (
        monthlyXlsx &&
        monthlyCsv &&
        monthlyMonth
    ) {
        let query =
            `month=${encodeURIComponent(
                monthlyMonth.value
            )}`;

        if (
            monthlyClass &&
            monthlyClass.value
        ) {
            query +=
                `&class_id=${encodeURIComponent(
                    monthlyClass.value
                )}`;
        }

        monthlyXlsx.href =
            `/api/reports/monthly/export.xlsx?${query}`;

        monthlyCsv.href =
            `/api/reports/monthly/export.csv?${query}`;
    }
}


// Update export links when filters change
[
    "report-daily-class",
    "report-daily-date",
    "report-monthly-class",
    "report-monthly-month",
].forEach((id) => {
    const element =
        document.getElementById(id);

    if (element) {
        element.addEventListener(
            "change",
            updateExportLinks
        );
    }
});


// ============================================================
// FLOATING ACTION BUTTON
// ============================================================

const fabMain =
    document.getElementById(
        "fab-main"
    );

const fabMenu =
    document.getElementById(
        "fab-menu"
    );

if (fabMain && fabMenu) {
    fabMain.addEventListener(
        "click",
        () => {
            const open =
                fabMenu.classList.toggle(
                    "open"
                );

            fabMain.setAttribute(
                "aria-expanded",
                open ? "true" : "false"
            );
        }
    );
}


// Quick Sign In
const fabSignin =
    document.getElementById(
        "fab-signin"
    );

if (fabSignin) {
    fabSignin.addEventListener(
        "click",
        () => {
            const signin =
                document.getElementById(
                    "signin-btn"
                );

            if (signin) {
                signin.click();
            }
        }
    );
}


// Quick Sign Out
const fabSignout =
    document.getElementById(
        "fab-signout"
    );

if (fabSignout) {
    fabSignout.addEventListener(
        "click",
        () => {
            const signout =
                document.getElementById(
                    "signout-btn"
                );

            if (signout) {
                signout.click();
            }
        }
    );
}


// ============================================================
// LOGOUT
// ============================================================

const logoutButton =
    document.getElementById(
        "logout-btn"
    );

if (logoutButton) {
    logoutButton.addEventListener(
        "click",
        async () => {
            logoutButton.disabled = true;

            await apiRequest(
                "/api/logout",
                {
                    method: "POST",
                }
            );

            window.location.href = "/";
        }
    );
}


// ============================================================
// INITIALIZE DASHBOARD
// ============================================================

async function initializeDashboard() {
    await loadClasses();
    await loadMe();
    updateExportLinks();
}

initializeDashboard();