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

app.post("/bands", async (req, res) => {
  try {
    const {
      band_name,
      hometown_city,
      hometown_state,
      active_start_year,
      active_end_year,
      status,
      notes
    } = req.body;

    const result = await pool.query(
      `
      INSERT INTO bands 
      (band_name, hometown_city, hometown_state, active_start_year, active_end_year, status, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
      `,
      [
        band_name,
        hometown_city,
        hometown_state,
        active_start_year,
        active_end_year,
        status,
        notes
      ]
    );

    res.json({
      message: "Band saved",
      band: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error saving band");
  }
});

app.get("/bands", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM bands ORDER BY id DESC");
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching bands");
  }
});

const PORT = process.env.PORT;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
