const express = require("express");
const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("OHMS backend running");
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
