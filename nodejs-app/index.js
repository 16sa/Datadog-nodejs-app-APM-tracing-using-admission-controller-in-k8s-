const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Hello from Datadog Node.js demo! 👋');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`App running on port ${port}`);
});
