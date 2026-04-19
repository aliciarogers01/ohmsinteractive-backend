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

      CREATE TABLE IF NOT EXISTS artists (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE
      );

      CREATE TABLE IF NOT EXISTS band_members (
        id SERIAL PRIMARY KEY,
        band_id INTEGER,
        artist_id INTEGER,
        instrument TEXT,
        start_year TEXT,
        end_year TEXT
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
      notes,
      members
    } = req.body;

    let bandResult = await pool.query(
      `SELECT * FROM bands WHERE LOWER(band_name) = LOWER($1) LIMIT 1`,
      [band_name]
    );

    let band;

    if (bandResult.rows.length === 0) {
      const newBandResult = await pool.query(
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

      band = newBandResult.rows[0];
    } else {
      band = bandResult.rows[0];
    }

    for (const member of members || []) {
      const { artist_name, instrument, year_start, year_end } = member;

      let artistResult = await pool.query(
        `SELECT * FROM artists WHERE LOWER(name) = LOWER($1) LIMIT 1`,
        [artist_name]
      );

      let artist;

      if (artistResult.rows.length === 0) {
        const newArtist = await pool.query(
          `INSERT INTO artists (name) VALUES ($1) RETURNING *`,
          [artist_name]
        );
        artist = newArtist.rows[0];
      } else {
        artist = artistResult.rows[0];
      }

      const existingLink = await pool.query(
        `
        SELECT * FROM band_members
        WHERE band_id = $1 AND artist_id = $2
        LIMIT 1
        `,
        [band.id, artist.id]
      );

      if (existingLink.rows.length === 0) {
        await pool.query(
          `
          INSERT INTO band_members
          (band_id, artist_id, instrument, start_year, end_year)
          VALUES ($1, $2, $3, $4, $5)
          `,
          [
            band.id,
            artist.id,
            instrument,
            year_start,
            year_end
          ]
        );
      }
    }

    res.json({
      message: "Band + members saved",
      band: band
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

app.get("/artists", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM artists ORDER BY id DESC");
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching artists");
  }
});

app.get("/artists/:id", async (req, res) => {
  try {
    const artistId = req.params.id;

    const artistResult = await pool.query(
      `SELECT * FROM artists WHERE id = $1`,
      [artistId]
    );

    if (artistResult.rows.length === 0) {
      return res.status(404).send("Artist not found");
    }

    const bandsResult = await pool.query(
      `
      SELECT
        bands.id,
        bands.band_name,
        band_members.instrument,
        band_members.start_year,
        band_members.end_year
      FROM band_members
      JOIN bands ON band_members.band_id = bands.id
      WHERE band_members.artist_id = $1
      ORDER BY bands.id DESC
      `,
      [artistId]
    );

    res.json({
      artist: artistResult.rows[0],
      bands: bandsResult.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching artist details");
  }
});

const PORT = process.env.PORT;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
