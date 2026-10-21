import express from "express";
import cors from "cors";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = process.env.PORT || 4000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "db.json");

const VALID_TYPES = ["Offering", "Requesting"];
const VALID_CATEGORIES = ["Programming", "Design", "Writing", "Tutoring"];
const VALID_PAYMENT_TYPES = ["Paid", "SkillSwap", "Free"];
const MAX_TITLE_LENGTH = 100;
const MIN_DESCRIPTION_LENGTH = 10;
const MAX_DESCRIPTION_LENGTH = 1000;

app.use(cors());
app.use(express.json());

/* ---------- Helpers ---------- */

// Runs one request at a time so two requests can never
// read/write db.json at the same moment and corrupt it.
let queue = Promise.resolve();
function withLock(task) {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}

// Wraps every route: serializes access and sends errors to the error handler.
const route = handler => (req, res, next) =>
  withLock(() => handler(req, res)).catch(next);

async function readDB() {
  const db = JSON.parse(await fs.readFile(DB_PATH, "utf8"));
  db.users = db.users || [];
  db.gigs = db.gigs || [];
  db.applications = db.applications || [];
  db.reviews = db.reviews || [];
  return db;
}

async function writeDB(db) {
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
}

function nextId(items, prefix) {
  const max = items.reduce((n, item) => {
    const found = Number(String(item.id).replace(prefix, ""));
    return Number.isFinite(found) ? Math.max(n, found) : n;
  }, 0);

  return `${prefix}${max + 1}`;
}

function averageRating(db, userId) {
  const ratings = db.reviews
    .filter(review => review.reviewee_id === userId)
    .map(review => review.rating);

  return ratings.length
    ? Math.round(
        (ratings.reduce((total, rating) => total + rating, 0) /
          ratings.length) *
          10
      ) / 10
    : null;
}

function publicUser(user, db) {
  return {
    ...user,
    // Every gig this student created.
    gigs_posted: db.gigs.filter(gig => gig.user_id === user.id).length,
    // Completed gigs where the student was the owner or the accepted applicant.
    gigs_completed: db.gigs.filter(
      gig =>
        gig.status === "Completed" &&
        (gig.user_id === user.id || gig.accepted_applicant_id === user.id)
    ).length,
    average_rating: averageRating(db, user.id)
  };
}

function actualStatus(gig) {
  if (
    gig.status === "Open" &&
    gig.deadline &&
    new Date(`${gig.deadline}T23:59:59`) < new Date()
  ) {
    return "Expired";
  }

  return gig.status;
}

// Today's date in the server's local time, as YYYY-MM-DD.
function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidFutureOrTodayDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  // Reject impossible dates such as 2027-02-30.
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return false;
  }

  return value >= todayString();
}

/* ---------- Health ---------- */

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, message: "Campus Gig API is running" });
});

/* ---------- Users ---------- */

app.get(
  "/api/users",
  route(async (_req, res) => {
    const db = await readDB();
    res.json(db.users.map(user => publicUser(user, db)));
  })
);

app.get(
  "/api/users/:id",
  route(async (req, res) => {
    const db = await readDB();
    const user = db.users.find(user => user.id === req.params.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(publicUser(user, db));
  })
);

/* ---------- Gigs ---------- */

app.get(
  "/api/gigs",
  route(async (req, res) => {
    const db = await readDB();

    let result = db.gigs.map(gig => ({
      ...gig,
      status: actualStatus(gig),
      owner: db.users.find(user => user.id === gig.user_id)
    }));

    const {
      category,
      type,
      payment_type,
      q,
      minBudget,
      maxBudget,
      status,
      user_id
    } = req.query;

    if (category && category !== "All") {
      result = result.filter(gig => gig.category === category);
    }

    if (type && type !== "All") {
      result = result.filter(gig => gig.type === type);
    }

    if (payment_type && payment_type !== "All") {
      result = result.filter(gig => gig.payment_type === payment_type);
    }

    if (status && status !== "All") {
      result = result.filter(gig => gig.status === status);
    }

    if (user_id) {
      result = result.filter(gig => gig.user_id === user_id);
    }

    if (q) {
      const needle = String(q).toLowerCase();

      result = result.filter(gig =>
        `${gig.title} ${gig.description}`.toLowerCase().includes(needle)
      );
    }

    if (minBudget !== undefined && minBudget !== "") {
      const minimum = Number(minBudget);

      if (Number.isFinite(minimum)) {
        result = result.filter(
          gig => gig.budget !== null && gig.budget >= minimum
        );
      } else {
        result = [];
      }
    }

    if (maxBudget !== undefined && maxBudget !== "") {
      const maximum = Number(maxBudget);

      if (Number.isFinite(maximum)) {
        result = result.filter(
          gig => gig.budget !== null && gig.budget <= maximum
        );
      } else {
        result = [];
      }
    }

    result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json(result);
  })
);

app.get(
  "/api/gigs/:id",
  route(async (req, res) => {
    const db = await readDB();
    const gig = db.gigs.find(gig => gig.id === req.params.id);

    if (!gig) {
      return res.status(404).json({ error: "Gig not found" });
    }

    res.json({
      ...gig,
      status: actualStatus(gig),
      owner: db.users.find(user => user.id === gig.user_id)
    });
  })
);

app.post(
  "/api/gigs",
  route(async (req, res) => {
    const db = await readDB();

    const {
      user_id,
      title,
      description,
      type,
      category,
      payment_type,
      budget,
      deadline
    } = req.body ?? {};

    if (!db.users.some(user => user.id === user_id)) {
      return res.status(400).json({ error: "Choose a valid student profile." });
    }

    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "A title is required." });
    }

    if (title.trim().length > MAX_TITLE_LENGTH) {
      return res.status(400).json({
        error: `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`
      });
    }

    if (typeof description !== "string" || !description.trim()) {
      return res.status(400).json({ error: "A description is required." });
    }

    if (description.trim().length < MIN_DESCRIPTION_LENGTH) {
      return res.status(400).json({
        error: `Description must be at least ${MIN_DESCRIPTION_LENGTH} characters.`
      });
    }

    if (description.trim().length > MAX_DESCRIPTION_LENGTH) {
      return res.status(400).json({
        error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`
      });
    }

    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: "Choose Offering or Requesting." });
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: "Choose a valid category." });
    }

    if (!VALID_PAYMENT_TYPES.includes(payment_type)) {
      return res.status(400).json({ error: "Choose a valid payment type." });
    }

    if (!isValidFutureOrTodayDate(deadline)) {
      return res.status(400).json({
        error: "Choose a valid deadline that is today or in the future."
      });
    }

    const numericBudget =
      budget === "" || budget === null || budget === undefined
        ? null
        : Number(budget);

    if (
      payment_type === "Paid" &&
      (!Number.isFinite(numericBudget) || numericBudget <= 0)
    ) {
      return res.status(400).json({
        error: "Paid gigs need a budget greater than zero."
      });
    }

    if (payment_type !== "Paid" && numericBudget !== null) {
      return res.status(400).json({
        error: "Only paid gigs can have a budget."
      });
    }

    const gig = {
      id: nextId(db.gigs, "g"),
      user_id,
      title: title.trim(),
      description: description.trim(),
      type,
      category,
      payment_type,
      budget: payment_type === "Paid" ? numericBudget : null,
      deadline,
      status: "Open",
      accepted_applicant_id: null,
      created_at: new Date().toISOString()
    };

    db.gigs.push(gig);
    await writeDB(db);

    res.status(201).json(gig);
  })
);

app.patch(
  "/api/gigs/:id",
  route(async (req, res) => {
    const db = await readDB();
    const gig = db.gigs.find(gig => gig.id === req.params.id);

    if (!gig) {
      return res.status(404).json({ error: "Gig not found." });
    }

    const { owner_id, status } = req.body ?? {};

    if (gig.user_id !== owner_id) {
      return res.status(403).json({
        error: "Only the gig owner can change this gig."
      });
    }

    const allowed = {
      Open: ["Cancelled"],
      "In Progress": ["Completed"]
    };

    if (!allowed[gig.status]?.includes(status)) {
      return res.status(400).json({
        error: `Invalid status change from ${gig.status} to ${status}.`
      });
    }

    if (status === "Completed" && !gig.accepted_applicant_id) {
      return res.status(400).json({
        error: "A gig needs an accepted applicant before completion."
      });
    }

    gig.status = status;
    await writeDB(db);

    res.json({ ...gig, status: actualStatus(gig) });
  })
);

/* ---------- Applications ---------- */

app.get(
  "/api/applications",
  route(async (req, res) => {
    const db = await readDB();

    let result = db.applications.map(application => ({
      ...application,
      gig: db.gigs.find(gig => gig.id === application.gig_id),
      applicant: db.users.find(user => user.id === application.applicant_id)
    }));

    if (req.query.applicant_id) {
      result = result.filter(
        application => application.applicant_id === req.query.applicant_id
      );
    }

    if (req.query.gig_id) {
      result = result.filter(
        application => application.gig_id === req.query.gig_id
      );
    }

    res.json(result);
  })
);

app.post(
  "/api/applications",
  route(async (req, res) => {
    const db = await readDB();
    const { gig_id, applicant_id, message } = req.body ?? {};

    const gig = db.gigs.find(gig => gig.id === gig_id);

    if (!gig) {
      return res.status(404).json({ error: "Gig not found." });
    }

    if (!db.users.some(user => user.id === applicant_id)) {
      return res.status(400).json({ error: "Choose a valid student profile." });
    }

    if (gig.user_id === applicant_id) {
      return res.status(400).json({ error: "You cannot apply to your own gig." });
    }

    if (actualStatus(gig) !== "Open") {
      return res.status(400).json({
        error: "This gig is not open for applications."
      });
    }

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error: "Please add a short application message."
      });
    }

    if (
      db.applications.some(
        application =>
          application.gig_id === gig_id &&
          application.applicant_id === applicant_id
      )
    ) {
      return res.status(409).json({
        error: "You have already applied to this gig."
      });
    }

    const application = {
      id: nextId(db.applications, "a"),
      gig_id,
      applicant_id,
      message: message.trim(),
      status: "Pending",
      created_at: new Date().toISOString()
    };

    db.applications.push(application);
    await writeDB(db);

    res.status(201).json(application);
  })
);

app.patch(
  "/api/applications/:id",
  route(async (req, res) => {
    const db = await readDB();
    const application = db.applications.find(
      application => application.id === req.params.id
    );

    if (!application) {
      return res.status(404).json({ error: "Application not found." });
    }

    const gig = db.gigs.find(gig => gig.id === application.gig_id);
    const { status, owner_id } = req.body ?? {};

    if (!gig || gig.user_id !== owner_id) {
      return res.status(403).json({
        error: "Only the gig owner can manage applications."
      });
    }

    if (actualStatus(gig) !== "Open") {
      return res.status(400).json({
        error: "Applications can only be managed while the gig is Open."
      });
    }

    if (!["Accepted", "Rejected"].includes(status)) {
      return res.status(400).json({
        error: "Status must be Accepted or Rejected."
      });
    }

    if (application.status !== "Pending") {
      return res.status(400).json({
        error: "Only pending applications can be accepted or rejected."
      });
    }

    if (status === "Accepted") {
      application.status = "Accepted";
      gig.accepted_applicant_id = application.applicant_id;
      gig.status = "In Progress";

      // Reject everyone else who is still waiting.
      db.applications
        .filter(
          other =>
            other.gig_id === gig.id &&
            other.id !== application.id &&
            other.status === "Pending"
        )
        .forEach(other => {
          other.status = "Rejected";
        });
    } else {
      application.status = "Rejected";
    }

    await writeDB(db);
    res.json(application);
  })
);

/* ---------- Reviews ---------- */

app.get(
  "/api/reviews",
  route(async (req, res) => {
    const db = await readDB();

    let result = db.reviews.map(review => ({
      ...review,
      reviewer: db.users.find(user => user.id === review.reviewer_id),
      reviewee: db.users.find(user => user.id === review.reviewee_id),
      gig: db.gigs.find(gig => gig.id === review.gig_id)
    }));

    if (req.query.user_id) {
      result = result.filter(
        review =>
          review.reviewer_id === req.query.user_id ||
          review.reviewee_id === req.query.user_id
      );
    }

    res.json(result);
  })
);

app.post(
  "/api/reviews",
  route(async (req, res) => {
    const db = await readDB();
    const { gig_id, reviewer_id, rating, comment } = req.body ?? {};

    const gig = db.gigs.find(gig => gig.id === gig_id);

    if (!gig) {
      return res.status(404).json({ error: "Gig not found." });
    }

    if (gig.status !== "Completed") {
      return res.status(400).json({
        error: "Reviews are only available after completion."
      });
    }

    const participants = [gig.user_id, gig.accepted_applicant_id].filter(Boolean);

    if (!participants.includes(reviewer_id) || participants.length !== 2) {
      return res.status(403).json({
        error: "Only the gig owner and accepted applicant can review each other."
      });
    }

    const reviewee_id = participants.find(id => id !== reviewer_id);

    if (
      db.reviews.some(
        review =>
          review.gig_id === gig_id && review.reviewer_id === reviewer_id
      )
    ) {
      return res.status(409).json({
        error: "You have already reviewed this gig."
      });
    }

    const numericRating = Number(rating);

    if (
      !Number.isInteger(numericRating) ||
      numericRating < 1 ||
      numericRating > 5
    ) {
      return res.status(400).json({ error: "Rating must be from 1 to 5." });
    }

    if (typeof comment !== "string" || !comment.trim()) {
      return res.status(400).json({ error: "Please write a short comment." });
    }

    const review = {
      id: nextId(db.reviews, "r"),
      gig_id,
      reviewer_id,
      reviewee_id,
      rating: numericRating,
      comment: comment.trim(),
      created_at: new Date().toISOString()
    };

    db.reviews.push(review);
    await writeDB(db);

    res.status(201).json(review);
  })
);

/* ---------- Errors ---------- */

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found." });
});

app.use((err, _req, res, _next) => {
  // Bad JSON sent by the browser.
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON in request body." });
  }

  console.error(err);
  res.status(500).json({ error: "Unexpected server error." });
});

app.listen(PORT, () => {
  console.log(`Campus Gig API running at http://localhost:${PORT}/api`);
});