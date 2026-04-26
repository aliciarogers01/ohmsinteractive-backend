const express = require("express");
const app = express();
const pool = require("./db");
const cors = require("cors");

app.use(express.json());

app.use(
  cors({
    origin: [
      "http://localhost:8081",
      "http://localhost:8082",
      "http://localhost:19006",
      "https://media.ohiomusicscene.com"
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
  })
);

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
        notes TEXT,
        image_url TEXT DEFAULT ''
      );

CREATE TABLE IF NOT EXISTS artists (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE,
  hometown_city TEXT,
  hometown_state TEXT,
  active_start_year TEXT,
  active_end_year TEXT,
  status TEXT,
  notes TEXT,
  image_url TEXT DEFAULT ''
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
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '';
`);

    await pool.query(`
      ALTER TABLE bands
      ADD COLUMN IF NOT EXISTS hometown_city TEXT,
      ADD COLUMN IF NOT EXISTS hometown_state TEXT,
      ADD COLUMN IF NOT EXISTS active_start_year TEXT,
      ADD COLUMN IF NOT EXISTS active_end_year TEXT,
      ADD COLUMN IF NOT EXISTS status TEXT,
      ADD COLUMN IF NOT EXISTS notes TEXT,
      ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '';
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
      image_url,
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
        (band_name, hometown_city, hometown_state, active_start_year, active_end_year, status, notes, image_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *;
        `,
        [
          band_name,
          hometown_city || "",
          hometown_state || "",
          active_start_year || "",
          active_end_year || "",
          status || "",
          notes || "",
          image_url || ""
        ]
      );

      band = newBandResult.rows[0];
    } else {
      const updatedBandResult = await pool.query(
        `
        UPDATE bands
        SET
          hometown_city = $1,
          hometown_state = $2,
          active_start_year = $3,
          active_end_year = $4,
          status = $5,
          notes = $6,
          image_url = $7
        WHERE id = $8
        RETURNING *;
        `,
        [
          hometown_city || "",
          hometown_state || "",
          active_start_year || "",
          active_end_year || "",
          status || "",
          notes || "",
          image_url || "",
          bandResult.rows[0].id
        ]
      );

      band = updatedBandResult.rows[0];
    }

    for (const member of members || []) {
      const { artist_name, instrument, year_start, year_end, start_year, end_year } = member;

      const cleanArtistName = (artist_name || "").trim();
      if (!cleanArtistName) continue;

      let artistResult = await pool.query(
        `SELECT * FROM artists WHERE LOWER(name) = LOWER($1) LIMIT 1`,
        [cleanArtistName]
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
          [cleanArtistName]
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
            instrument || "",
            start_year || year_start || "",
            end_year || year_end || ""
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
    const result = await pool.query(
      "SELECT * FROM bands ORDER BY LOWER(band_name) ASC"
    );
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
        artists.name AS artist_name,
        band_members.instrument,
        band_members.start_year,
        band_members.end_year
      FROM band_members
      JOIN artists ON band_members.artist_id = artists.id
      WHERE band_members.band_id = $1
      ORDER BY LOWER(artists.name) ASC
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

app.put("/bands/:id", async (req, res) => {
  try {
    const bandId = req.params.id;

    const {
      band_name,
      hometown_city,
      hometown_state,
      active_start_year,
      active_end_year,
      status,
      notes,
      image_url,
      members
    } = req.body;

    const updateResult = await pool.query(
      `
      UPDATE bands
      SET
        band_name = $1,
        hometown_city = $2,
        hometown_state = $3,
        active_start_year = $4,
        active_end_year = $5,
        status = $6,
        notes = $7,
        image_url = $8
      WHERE id = $9
      RETURNING *
      `,
      [
        band_name,
        hometown_city || "",
        hometown_state || "",
        active_start_year || "",
        active_end_year || "",
        status || "",
        notes || "",
        image_url || "",
        bandId
      ]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: "Band not found" });
    }

    await pool.query(
      `DELETE FROM band_members WHERE band_id = $1`,
      [bandId]
    );

    for (const member of members || []) {
      const cleanArtistName = (member.artist_name || "").trim();
      if (!cleanArtistName) continue;

      let artistResult = await pool.query(
        `SELECT * FROM artists WHERE LOWER(name) = LOWER($1) LIMIT 1`,
        [cleanArtistName]
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
          [cleanArtistName]
        );
        artist = newArtist.rows[0];
      } else {
        artist = artistResult.rows[0];
      }

      await pool.query(
        `
        INSERT INTO band_members
        (band_id, artist_id, instrument, start_year, end_year)
        VALUES ($1, $2, $3, $4, $5)
        `,
        [
          bandId,
          artist.id,
          member.instrument || "",
          member.start_year || member.year_start || "",
          member.end_year || member.year_end || ""
        ]
      );
    }

    const membersResult = await pool.query(
      `
      SELECT
        artists.id AS artist_id,
        artists.name AS artist_name,
        band_members.instrument,
        band_members.start_year,
        band_members.end_year
      FROM band_members
      JOIN artists ON band_members.artist_id = artists.id
      WHERE band_members.band_id = $1
      ORDER BY LOWER(artists.name) ASC
      `,
      [bandId]
    );

    res.json({
      ...updateResult.rows[0],
      members: membersResult.rows
    });
  } catch (error) {
    console.error("Error updating band:", error);
    res.status(500).json({ error: "Error updating band" });
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
    const result = await pool.query(
      "SELECT * FROM artists ORDER BY LOWER(name) ASC"
    );
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
      ORDER BY LOWER(bands.band_name) ASC
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
  image_url,
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
(name, hometown_city, hometown_state, active_start_year, active_end_year, status, notes, image_url)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *
        `,
[
  artist_name,
  hometown_city || "",
  hometown_state || "",
  active_start_year || "",
  active_end_year || "",
  status || "",
  notes || "",
  image_url || ""
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
  notes = $6,
  image_url = $7
WHERE id = $8
RETURNING *
        `,
[
  hometown_city || "",
  hometown_state || "",
  active_start_year || "",
  active_end_year || "",
  status || "",
  notes || "",
  image_url || "",
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

      const cleanBandName = (band_name || "").trim();
      if (!cleanBandName) continue;

      let bandResult = await pool.query(
        `SELECT * FROM bands WHERE LOWER(band_name) = LOWER($1) LIMIT 1`,
        [cleanBandName]
      );

      let band;

      if (bandResult.rows.length === 0) {
        const newBand = await pool.query(
          `
          INSERT INTO bands
          (band_name, hometown_city, hometown_state, active_start_year, active_end_year, status, notes, image_url)
          VALUES ($1, $2, $3, '', '', '', '', '')
          RETURNING *;
          `,
          [cleanBandName, band_city || "", band_state || ""]
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
  try {
    const artistId = req.params.id;

const {
  name,
  artist_name,
  image_url,
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
  notes = $7,
  image_url = $8
WHERE id = $9
RETURNING *
      `,
[
  artist_name || name,
  hometown_city || "",
  hometown_state || "",
  active_start_year || "",
  active_end_year || "",
  status || "",
  notes || "",
  image_url || "",
  artistId
]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: "Artist not found" });
    }

    await pool.query(
      `DELETE FROM band_members WHERE artist_id = $1`,
      [artistId]
    );

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
          (band_name, hometown_city, hometown_state, active_start_year, active_end_year, status, notes, image_url)
          VALUES ($1, '', '', '', '', '', '', '')
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

    const bandsResult = await pool.query(
      `
      SELECT
        bands.id,
        bands.band_name
      FROM band_members
      JOIN bands ON band_members.band_id = bands.id
      WHERE band_members.artist_id = $1
      ORDER BY LOWER(bands.band_name) ASC
      `,
      [artistId]
    );

    res.json({
      ...updateResult.rows[0],
      bands: bandsResult.rows
    });
} catch (err) {
  console.error("Error updating artist:", err);
  res.status(500).json({
    error: "Error updating artist",
    details: err.message
  });
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
