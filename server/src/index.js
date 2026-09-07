const { createDb } = require("./db");
const { createApp } = require("./app");

const PORT = process.env.PORT || 4000;

const db = createDb();
const app = createApp(db);

app.listen(PORT, () => {
  console.log(`Smart Watchlist API listening on http://localhost:${PORT}`);
  console.log(`Demo user:  demo@watchlist.app / demo1234`);
  console.log(`Admin user: admin@watchlist.app / admin1234`);
});
