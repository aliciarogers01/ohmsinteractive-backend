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
        name TEXT UNIQUE,
        hometown_city TEXT,
        hometown_state TEXT,
        active_start_year TEXT,
        active_end_year TEXT,
        status TEXT,
        notes TEXT
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

    await pool.query(`
      ALTER TABLE artists
      ADD COLUMN IF NOT EXISTS hometown_city TEXT,
      ADD COLUMN IF NOT EXISTS hometown_state TEXT,
      ADD COLUMN IF NOT EXISTS active_start_year TEXT,
      ADD COLUMN IF NOT EXISTS active_end_year TEXT,
      ADD COLUMN IF NOT EXISTS status TEXT,
      ADD COLUMN IF NOT EXISTS notes TEXT;
    `);

    res.send("Tables created/updated");
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
          `
          INSERT INTO artists
          (name, hometown_city, hometown_state, active_start_year, active_end_year, status, notes)
          VALUES ($1, '', '', '', '', '', '')
          RETURNING *
          `,
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
          [band.id, artist.id, instrument, year_start, year_end]
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

app.get("/bands/:id", async (req, res) => {
  try {
    const bandId = req.params.id;

    const bandResult = await pool.query(
      `SELECT * FROM bands WHERE id = $1`,
      [bandId]
    );

    if (bandResult.rows.length === 0) {
      return res.status(404).send("Band not found");
    }

    const membersResult = await pool.query(
      `
      SELECT
        artists.id AS artist_id,
        artists.name AS artist_name
      FROM band_members
      JOIN artists ON band_members.artist_id = artists.id
      WHERE band_members.band_id = $1
      ORDER BY artists.name ASC
      `,
      [bandId]
    );

    res.json({
      ...bandResult.rows[0],
      members: membersResult.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching band");
  }
});

app.put("/artists/:id", async (req, res) => {
  try {
    const artistId = req.params.id;

    const {
      name,
      hometown_city,
      hometown_state,
      active_start_year,
      active_end_year,
      status,
      notes,
      bands
    } = req.body;

    const updateResult = await pool.query(
      `
      UPDATE artists
      SET
        name = $1,
        hometown_city = $2,
        hometown_state = $3,
        active_start_year = $4,
        active_end_year = $5,
        status = $6,
        notes = $7
      WHERE id = $8
      RETURNING *
      `,
      [
        name,
        hometown_city || "",
        hometown_state || "",
        active_start_year || "",
        active_end_year || "",
        status || "",
        notes || "",
        artistId
      ]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: "Artist not found" });
    }

    // 🔥 CLEAR EXISTING BAND LINKS
    await pool.query(
      `DELETE FROM band_members WHERE artist_id = $1`,
      [artistId]
    );

    // 🔥 RE-ADD BANDS
    for (const bandEntry of bands || []) {
      const bandName = (bandEntry.band_name || "").trim();

      if (!bandName) continue;

      let bandResult = await pool.query(
        `SELECT * FROM bands WHERE LOWER(band_name) = LOWER($1) LIMIT 1`,
        [bandName]
      );

      let band;

      if (bandResult.rows.length === 0) {
        const newBand = await pool.query(
          `
          INSERT INTO bands
          (band_name, hometown_city, hometown_state, active_start_year, active_end_year, status, notes)
          VALUES ($1, '', '', '', '', '', '')
          RETURNING *
          `,
          [bandName]
        );
        band = newBand.rows[0];
      } else {
        band = bandResult.rows[0];
      }

      await pool.query(
        `
        INSERT INTO band_members
        (band_id, artist_id, instrument, start_year, end_year)
        VALUES ($1, $2, '', '', '')
        `,
        [band.id, artistId]
      );
    }

    // 🔥 RETURN UPDATED BANDS
    const bandsResult = await pool.query(
      `
      SELECT
        bands.id,
        bands.band_name
      FROM band_members
      JOIN bands ON band_members.band_id = bands.id
      WHERE band_members.artist_id = $1
      ORDER BY bands.band_name ASC
      `,
      [artistId]
    );

    res.json({
      ...updateResult.rows[0],
      bands: bandsResult.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error updating artist" });
  }
});

app.delete("/bands/:id", async (req, res) => {
  try {
    const bandId = req.params.id;

    await pool.query(
      `DELETE FROM band_members WHERE band_id = $1`,
      [bandId]
    );

    const result = await pool.query(
      `DELETE FROM bands WHERE id = $1 RETURNING *`,
      [bandId]
    );

    if (result.rows.length === 0) {
      return res.status(404).send("Band not found");
    }

    res.json({
      message: "Band deleted",
      band: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error deleting band");
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
  ...artistResult.rows[0],
  bands: bandsResult.rows
});
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching artist details");
  }
});

app.post("/artists", async (req, res) => {
  try {
    const {
      artist_name,
      hometown_city,
      hometown_state,
      active_start_year,
      active_end_year,
      status,
      notes,
      bands
    } = req.body;

    let artistResult = await pool.query(
      `SELECT * FROM artists WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [artist_name]
    );

    let artist;

    if (artistResult.rows.length === 0) {
      const newArtist = await pool.query(
        `
        INSERT INTO artists
        (name, hometown_city, hometown_state, active_start_year, active_end_year, status, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        `,
        [
          artist_name,
          hometown_city || "",
          hometown_state || "",
          active_start_year || "",
          active_end_year || "",
          status || "",
          notes || ""
        ]
      );
      artist = newArtist.rows[0];
    } else {
      const updatedArtist = await pool.query(
        `
        UPDATE artists
        SET
          hometown_city = $1,
          hometown_state = $2,
          active_start_year = $3,
          active_end_year = $4,
          status = $5,
          notes = $6
        WHERE id = $7
        RETURNING *
        `,
        [
          hometown_city || "",
          hometown_state || "",
          active_start_year || "",
          active_end_year || "",
          status || "",
          notes || "",
          artistResult.rows[0].id
        ]
      );
      artist = updatedArtist.rows[0];
    }

    for (const bandEntry of bands || []) {
      const {
        band_name,
        hometown_city: band_city,
        hometown_state: band_state,
        instrument,
        start_year,
        end_year
      } = bandEntry;

      let bandResult = await pool.query(
        `SELECT * FROM bands WHERE LOWER(band_name) = LOWER($1) LIMIT 1`,
        [band_name]
      );

      let band;

      if (bandResult.rows.length === 0) {
        const newBand = await pool.query(
          `
          INSERT INTO bands
          (band_name, hometown_city, hometown_state, active_start_year, active_end_year, status, notes)
          VALUES ($1, $2, $3, '', '', '', '')
          RETURNING *;
          `,
          [band_name, band_city || "", band_state || ""]
        );
        band = newBand.rows[0];
      } else {
        band = bandResult.rows[0];
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
            instrument || "",
            start_year || "",
            end_year || ""
          ]
        );
      }
    }

    res.json({
      message: "Artist + bands saved",
      artist: artist
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error saving artist");
  }
});

app.put("/artists/:id", async (req, res) => {
  const { id } = req.params;
  const {
    name,
    hometown_city,
    hometown_state,
    active_start_year,
    active_end_year,
    status,
    notes
  } = req.body;

  try {
    const result = await pool.query(
      `
      UPDATE artists
      SET
        name = $1,
        hometown_city = $2,
        hometown_state = $3,
        active_start_year = $4,
        active_end_year = $5,
        status = $6,
        notes = $7
      WHERE id = $8
      RETURNING *
      `,
      [
        name,
        hometown_city || "",
        hometown_state || "",
        active_start_year || "",
        active_end_year || "",
        status || "",
        notes || "",
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Artist not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error updating artist:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.delete("/artists/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(
      `DELETE FROM band_members WHERE artist_id = $1`,
      [id]
    );

    const result = await pool.query(
      `DELETE FROM artists WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Artist not found" });
    }

    res.json({ message: "Artist deleted successfully" });
  } catch (err) {
    console.error("Error deleting artist:", err);
    res.status(500).json({ error: "Server error" });
  }
});

const PORT = process.env.PORT;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
