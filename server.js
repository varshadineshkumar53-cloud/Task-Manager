const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 5050;

const DATA = path.join(__dirname, "data.json");
const SECRET = "fresh-task-manager-2026";

if (!fs.existsSync(DATA)) {
    fs.writeFileSync(
        DATA,
        JSON.stringify({ users: [], tasks: [] }, null, 2)
    );
}

function readData() {
    return JSON.parse(fs.readFileSync(DATA, "utf8"));
}

function saveData(data) {
    fs.writeFileSync(DATA, JSON.stringify(data, null, 2));
}

function hash(password) {
    return crypto
        .createHash("sha256")
        .update(password)
        .digest("hex");
}

function createToken() {
    return crypto.randomBytes(32).toString("hex");
}

const sessions = new Map();

function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods":
            "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    });

    res.end(JSON.stringify(data));
}

function getBody(req) {
    return new Promise((resolve) => {
        let body = "";

        req.on("data", (chunk) => {
            body += chunk;
        });

        req.on("end", () => {
            try {
                resolve(JSON.parse(body || "{}"));
            } catch {
                resolve({});
            }
        });
    });
}

function getUser(req) {
    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
        return null;
    }

    const token = authorization.substring(7);

    return sessions.get(token) || null;
}

function createId() {
    return (
        Date.now().toString(36) +
        Math.random().toString(36).substring(2, 8)
    );
}

async function handleAPI(req, res) {

    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers":
                "Content-Type, Authorization",
            "Access-Control-Allow-Methods":
                "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        });

        return res.end();
    }

    const url = new URL(req.url, "http://localhost");
    const pathname = url.pathname;

    const data = readData();

    // Test API
    if (
        req.method === "GET" &&
        pathname === "/api/test"
    ) {
        return sendJSON(res, 200, {
            success: true,
            message: "Backend is working!"
        });
    }

    // SIGNUP
    if (
        req.method === "POST" &&
        pathname === "/api/signup"
    ) {
        const body = await getBody(req);

        const name = String(body.name || "").trim();
        const email = String(body.email || "")
            .trim()
            .toLowerCase();

        const password = String(body.password || "");

        if (!name || !email || !password) {
            return sendJSON(res, 400, {
                success: false,
                message: "Please fill all fields."
            });
        }

        if (password.length < 6) {
            return sendJSON(res, 400, {
                success: false,
                message:
                    "Password must be at least 6 characters."
            });
        }

        const existingUser = data.users.find(
            (user) => user.email === email
        );

        if (existingUser) {
            return sendJSON(res, 409, {
                success: false,
                message:
                    "Email already registered. Please login."
            });
        }

        const newUser = {
            id: createId(),
            name: name,
            email: email,
            password: hash(password)
        };

        data.users.push(newUser);

        saveData(data);

        return sendJSON(res, 201, {
            success: true,
            message: "Account created successfully!"
        });
    }

    // LOGIN
    if (
        req.method === "POST" &&
        pathname === "/api/login"
    ) {
        const body = await getBody(req);

        const email = String(body.email || "")
            .trim()
            .toLowerCase();

        const password = String(body.password || "");

        const user = data.users.find(
            (item) => item.email === email
        );

        if (
            !user ||
            user.password !== hash(password)
        ) {
            return sendJSON(res, 401, {
                success: false,
                message: "Invalid email or password."
            });
        }

        const token = createToken();

        sessions.set(token, user.id);

        return sendJSON(res, 200, {
            success: true,
            token: token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });
    }

    // AUTHENTICATION
    const userId = getUser(req);

    if (!userId) {
        return sendJSON(res, 401, {
            success: false,
            message: "Please login first."
        });
    }

    // GET TASKS
    if (
        req.method === "GET" &&
        pathname === "/api/tasks"
    ) {
        const tasks = data.tasks.filter(
            (task) => task.userId === userId
        );

        return sendJSON(res, 200, {
            success: true,
            tasks: tasks
        });
    }

    // CREATE TASK
    if (
        req.method === "POST" &&
        pathname === "/api/tasks"
    ) {
        const body = await getBody(req);

        const title = String(body.title || "").trim();

        if (!title) {
            return sendJSON(res, 400, {
                success: false,
                message: "Task cannot be empty."
            });
        }

        const task = {
            id: createId(),
            userId: userId,
            title: title,
            completed: false,
            createdAt: new Date().toISOString()
        };

        data.tasks.push(task);

        saveData(data);

        return sendJSON(res, 201, {
            success: true,
            task: task
        });
    }

    // TASK ID
    const match = pathname.match(
        /^\/api\/tasks\/([^/]+)$/
    );

    if (match) {

        const taskId = match[1];

        const task = data.tasks.find(
            (item) =>
                item.id === taskId &&
                item.userId === userId
        );

        if (!task) {
            return sendJSON(res, 404, {
                success: false,
                message: "Task not found."
            });
        }

        // UPDATE TASK
        if (req.method === "PUT") {
            const body = await getBody(req);

            const title = String(
                body.title || ""
            ).trim();

            if (!title) {
                return sendJSON(res, 400, {
                    success: false,
                    message: "Task cannot be empty."
                });
            }

            task.title = title;

            saveData(data);

            return sendJSON(res, 200, {
                success: true,
                task: task
            });
        }

        // COMPLETE TASK
        if (req.method === "PATCH") {
            const body = await getBody(req);

            task.completed = body.completed === true;

            saveData(data);

            return sendJSON(res, 200, {
                success: true,
                task: task
            });
        }

        // DELETE TASK
        if (req.method === "DELETE") {

            data.tasks = data.tasks.filter(
                (item) => item.id !== taskId
            );

            saveData(data);

            return sendJSON(res, 200, {
                success: true,
                message: "Task deleted successfully."
            });
        }
    }

    return sendJSON(res, 404, {
        success: false,
        message: "Not found."
    });
}

// SERVER
const server = http.createServer((req, res) => {

    if (req.url.startsWith("/api/")) {
        return handleAPI(req, res);
    }

    let filePath =
        req.url === "/"
            ? "/login.html"
            : req.url.split("?")[0];

    const fullPath = path.join(
        __dirname,
        filePath
    );

    if (
        !fs.existsSync(fullPath) ||
        fs.statSync(fullPath).isDirectory()
    ) {
        res.writeHead(404, {
            "Content-Type": "text/plain"
        });

        return res.end("Not found");
    }

    const extension = path.extname(fullPath);

    const contentTypes = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "text/javascript",
        ".json": "application/json"
    };

    res.writeHead(200, {
        "Content-Type":
            contentTypes[extension] ||
            "application/octet-stream"
    });

    fs.createReadStream(fullPath).pipe(res);
});

// IMPORTANT FOR RENDER
server.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `TASK MANAGER READY ON PORT ${PORT}`
        );
    }
);
