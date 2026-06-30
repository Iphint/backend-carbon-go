import app from "./app.js";
import { loadEnv } from "./config/loadEnv.js";

loadEnv();

const port = process.env.PORT || 5000;

app.listen(port, () => {
  console.log(`Carbon-Go API running on http://localhost:${port}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});
