require('dotenv').config();
const app = require('./api/app');
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Food Redistribution System running at http://localhost:${port}`));
