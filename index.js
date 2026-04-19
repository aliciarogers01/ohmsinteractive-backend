const express = require("express");
const app = express();
const pool = require("./db");

app.use(express.json());

app.get("/", (req, res) => {
  res.send("OHMS backend running");
});

app.get("/init", async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bands (
        id SERIAL PRIMARY KEY,
        band_name TEXT,
        hometown_city TEXT,
        hometown_state TEXT,
        active_start_year TEXT,
        active_end_year TEXT,
        status TEXT,
        notes TEXT
      );
    `);

    res.send("Tables created");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error creating tables");
  }
});

app.post("/bands", (req, res) => {
  console.log("Received band data:", req.body);

  res.json({
    message: "Band data received successfully",
    data: req.body
  });
});

const PORT = process.env.PORT;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
