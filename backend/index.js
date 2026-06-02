const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const session = require("express-session");

// 🔴 REDIS
const { createClient } = require("redis");
const { RedisStore: SessionStore } = require("connect-redis");
const { RedisStore: RateLimitRedisStore } = require("rate-limit-redis");

// 🔐 SECURITY
const helmet = require("helmet");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { requireSession } = require("./middlewares/authMiddleware");

const { doubleCsrf } = require("csrf-csrf");

const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.SESSION_SECRET,
  cookieName: "__Host-csrf-token",
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  },
  size: 64,
  ignoredMethods: ["GET", "HEAD", "OPTIONS"],
});

dotenv.config();

/*
========================================
🔥 GLOBAL ERROR HANDLERS
========================================
*/
process.on("uncaughtException", (err) => {
  console.error("🔥 UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("🔥 UNHANDLED REJECTION:", err);
});

/*
========================================
🚀 APP INIT
========================================
*/
const app = express();
app.set("trust proxy", 1);
const PORT = process.env.SERVER_PORT || 5010;

/*
========================================
🔐 SECURITY
========================================
*/
const FRONTEND_URL = process.env.FRONTEND_URL;
const isProduction = process.env.NODE_ENV === "production";
const allowedConnectSrc = ["'self'", FRONTEND_URL].filter(Boolean);

app.use(
  helmet({
    frameguard: {
      action: "deny",
    },
    noSniff: true,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https:"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "data:", "https:"],
        connectSrc: allowedConnectSrc,
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],

        // Only force upgrade in QAT/PROD.
        // This avoids localhost http issues during development.
        ...(isProduction ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

app.use((req, res, next) => {
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  next();
});

/*
========================================
🌐 CORS
========================================
*/
app.use(
  cors({
    origin: [FRONTEND_URL],
    credentials: true,
  }),
);

/*
========================================
🔥 BODY PARSER
========================================
*/
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/*
========================================
🔴 REDIS CLIENT
========================================
*/
const redisClient = createClient({
  socket: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
  },
});

redisClient.on("error", (err) => {
  console.error("❌ Redis Error:", err);
});

/*
========================================
🔐 SESSION CHECK MIDDLEWARE
========================================
*/

const allowedStatuses = ["Active"];

/*
========================================
🚀 START SERVER
========================================
*/
async function startServer() {
  try {
    await redisClient.connect();
    console.log("✅ Redis connected");

    /*
    ========================================
    🧠 SESSION
    ========================================
    */
    const redisStore = new SessionStore({
      client: redisClient,
      prefix: "cmxqa:",
    });

    app.use(
      session({
        name: process.env.SESSION_NAME || "cmx_qa_session",
        store: redisStore,
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 1000 * 60 * 60 * 8,
        },
      }),
    );

    app.get("/api/csrf-token", (req, res) => {
      res.json({ csrfToken: generateToken(req, res) });
    });

    app.use(doubleCsrfProtection);

    /*
    ========================================
    🔥 RATE LIMITERS
    ========================================
    */

    // OTP limiter
    const otpLimiter = rateLimit({
      store: new RateLimitRedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
        prefix: "otp:",
      }),
      windowMs: 10 * 60 * 1000,
      max: 5,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) =>
        `${req.path}_${req.body?.emailAddress || "noemail"}_${ipKeyGenerator(req.ip)}`,
    });

    // General limiter
    const generalLimiter = rateLimit({
      store: new RateLimitRedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
        prefix: "general:",
      }),
      windowMs: 5 * 60 * 1000,
      max: 150,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) =>
        req.session?.user?.userid || ipKeyGenerator(req.ip),
    });

    /*
    ========================================
    📦 ROUTES
    ========================================
    */

    const authAPI = require("./services/authAPI");
    const qaUsersAPI = require("./services/qaUsersAPI");
    const qaAuditAPI = require("./services/qaAuditAPI");
    const qaFormsAPI = require("./services/qaFormsAPI");
    const qaLookupAPI = require("./services/qaLookupAPI");

    // General limiter for everything else
    app.use("/api", generalLimiter);

    // OTP limiter only for OTP route
    app.use("/api/sendOTP", otpLimiter);
    app.use("/api/verifyOTP", otpLimiter);

    // 🔓 PUBLIC ROUTES (NO SESSION)
    app.use("/api", authAPI);

    // 🔒 PROTECTED ROUTES (SESSION REQUIRED)
    app.use("/api", requireSession, qaUsersAPI);
    app.use("/api", requireSession, qaAuditAPI);
    app.use("/api", requireSession, qaFormsAPI);
    app.use("/api", requireSession, qaLookupAPI);

    /*
    ========================================
    ❤️ HEALTH CHECK
    ========================================
    */
    app.get("/", (req, res) => {
      res.send("QA Portal API running 🚀");
    });

    /*
    ========================================
    🚀 START
    ========================================
    */
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

startServer();
