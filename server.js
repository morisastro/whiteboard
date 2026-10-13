const express = require("express");
const {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");

const PORT = process.env.PORT || 3000;
const AUTH_USER = process.env.AUTH_USER;
const AUTH_PASS = process.env.AUTH_PASS;
const S3_BUCKET = process.env.S3_BUCKET;
const PREFIX = "boards/";
const MAX_BODY = "5mb";

const required = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Brak env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const s3 = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_PATH_STYLE !== "false",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});

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
      require("crypto").timingSafeEqual(Buffer.from(pass), Buffer.from(AUTH_PASS));
    if (okUser && okPass) return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="whiteboard"');
  res.status(401).send("Unauthorized");
}

app.use(auth);

function boardKey(id) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error("invalid id");
  return PREFIX + id + ".json";
}

async function s3List() {
  const out = await s3.send(
    new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: PREFIX })
  );
  return (out.Contents || [])
    .map((o) => o.Key)
    .filter(Boolean)
    .map((key) => key.slice(PREFIX.length).replace(/\.json$/, ""))
    .filter((id) => id.length > 0);
}

async function s3Get(id) {
  const out = await s3.send(
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: boardKey(id) })
  );
  const body = await out.Body.transformToString("utf8");
  return JSON.parse(body);
}

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.get("/api/boards", async (req, res, next) => {
  try {
    res.json({ boards: await s3List() });
  } catch (err) {
    next(err);
  }
});

app.get("/api/boards/:id", async (req, res, next) => {
  try {
    res.json(await s3Get(req.params.id));
  } catch (err) {
    if (err.name === "NoSuchKey") return res.status(404).json({ error: "not found" });
    next(err);
  }
});

app.put("/api/boards/:id", async (req, res, next) => {
  try {
    const { strokes } = req.body;
    if (!Array.isArray(strokes)) return res.status(400).json({ error: "strokes required" });
    if (strokes.length > 20000) return res.status(413).json({ error: "too big" });
    const data = { strokes, updatedAt: new Date().toISOString() };
    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: boardKey(req.params.id),
        Body: JSON.stringify(data),
        ContentType: "application/json",
      })
    );
    res.json({ ok: true, updatedAt: data.updatedAt });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/boards/:id", async (req, res, next) => {
  try {
    await s3.send(
      new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: boardKey(req.params.id) })
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "server error" });
});

app.listen(PORT, () => console.log(`whiteboard listening on :${PORT}`));
