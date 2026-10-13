const express = require("express");
const crypto = require("crypto");
const fsp = require("fs/promises");
const path = require("path");
const {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} = require("@aws-sdk/client-s3");

const PORT = process.env.PORT || 3000;
const AUTH_USER = process.env.AUTH_USER;
const AUTH_PASS = process.env.AUTH_PASS;
const STORAGE = process.env.STORAGE || "s3";
const LOCAL_DIR = process.env.LOCAL_DIR || "/data";
const S3_BUCKET = process.env.S3_BUCKET;
const PREFIX = "boards/";
const MAX_BODY = "25mb";

const CAPS = { strokes: 20000, notes: 500, columns: 50, arrows: 1000, images: 30 };

const required = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"];
const missing = required.filter((k) => !process.env[k]);
if (STORAGE === "s3" && missing.length) {
  console.error(`Brak env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const s3 = STORAGE === "s3"
  ? new S3Client({
      region: process.env.S3_REGION || "us-east-1",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: process.env.S3_PATH_STYLE !== "false",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY,
      },
    })
  : null;

const boardsDir = path.join(LOCAL_DIR, "boards");

function boardKey(id) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error("invalid id");
  return STORAGE === "s3" ? PREFIX + id + ".json" : path.join(boardsDir, id + ".json");
}

async function boardList() {
  if (STORAGE === "s3") {
    const out = await s3.send(
      new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: PREFIX })
    );
    return (out.Contents || [])
      .map((o) => o.Key)
      .filter(Boolean)
      .map((key) => key.slice(PREFIX.length).replace(/\.json$/, ""))
      .filter((id) => id.length > 0);
  }
  await fsp.mkdir(boardsDir, { recursive: true });
  return (await fsp.readdir(boardsDir))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

async function boardGet(id) {
  const key = boardKey(id);
  if (STORAGE === "s3") {
    const out = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    return JSON.parse(await out.Body.transformToString("utf8"));
  }
  try {
    return JSON.parse(await fsp.readFile(key, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") err.name = "NoSuchKey";
    throw err;
  }
}

async function boardPut(id, data) {
  const body = JSON.stringify(data);
  if (STORAGE === "s3") {
    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: boardKey(id),
        Body: body,
        ContentType: "application/json",
      })
    );
    return;
  }
  await fsp.mkdir(boardsDir, { recursive: true });
  await fsp.writeFile(boardKey(id), body, "utf8");
}

async function boardDelete(id) {
  if (STORAGE === "s3") {
    await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: boardKey(id) }));
    return;
  }
  await fsp.rm(boardKey(id), { force: true });
}

async function ensureBucket(attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
      return;
    } catch (err) {
      const notFound =
        err.name === "NotFound" ||
        err.name === "NoSuchBucket" ||
        err.$metadata?.httpStatusCode === 404;
      if (notFound) {
        try {
          await s3.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
          console.log(`Bucket utworzony: ${S3_BUCKET}`);
          return;
        } catch (createErr) {
          if (
            createErr.name === "BucketAlreadyOwnedByYou" ||
            createErr.name === "BucketAlreadyExists"
          ) {
            return;
          }
          err = createErr;
        }
      }
      if (i === attempts - 1) {
        console.error(
          `S3 nieosiągalny lub brak dostępu do bucketa ${S3_BUCKET}: ${err.message}`
        );
        return;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: MAX_BODY }));
app.use(express.static("public"));

function auth(req, res, next) {
  if (!AUTH_USER || !AUTH_PASS) return next();
  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    const user = decoded.slice(0, idx);
    const pass = decoded.slice(idx + 1);
    const okUser = user === AUTH_USER;
    const okPass =
      pass.length === AUTH_PASS.length &&
      crypto.timingSafeEqual(Buffer.from(pass), Buffer.from(AUTH_PASS));
    if (okUser && okPass) return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="whiteboard"');
  res.status(401).send("Unauthorized");
}

app.use(auth);

app.get("/api/health", (req, res) => res.json({ ok: true, storage: STORAGE }));

app.get("/api/boards", async (req, res, next) => {
  try {
    res.json({ boards: await boardList() });
  } catch (err) {
    next(err);
  }
});

app.get("/api/boards/:id", async (req, res, next) => {
  try {
    res.json(await boardGet(req.params.id));
  } catch (err) {
    if (err.name === "NoSuchKey") return res.status(404).json({ error: "not found" });
    next(err);
  }
});

app.put("/api/boards/:id", async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!Array.isArray(b.strokes)) return res.status(400).json({ error: "strokes required" });
    for (const key of Object.keys(CAPS)) {
      const arr = b[key];
      if (arr !== undefined && !Array.isArray(arr))
        return res.status(400).json({ error: `${key} must be array` });
      if (Array.isArray(arr) && arr.length > CAPS[key])
        return res.status(413).json({ error: `${key} too big` });
    }
    const data = {
      strokes: b.strokes,
      notes: b.notes || [],
      columns: b.columns || [],
      arrows: b.arrows || [],
      images: b.images || [],
      updatedAt: new Date().toISOString(),
    };
    await boardPut(req.params.id, data);
    res.json({ ok: true, updatedAt: data.updatedAt });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/boards/:id", async (req, res, next) => {
  try {
    await boardDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "server error" });
});

if (STORAGE === "s3") ensureBucket();

app.listen(PORT, () => console.log(`whiteboard listening on :${PORT} (storage: ${STORAGE})`));
