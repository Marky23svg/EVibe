require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const app = express();

connectDB();

app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/trips', require('./src/routes/trips'));
app.use('/api/expenses', require('./src/routes/expenses'));
app.use('/api/incomes', require('./src/routes/incomes'));
app.use('/api/gtfs', require('./src/routes/gtfs'));

app.get('/', (req, res) => res.json({ message: 'GoGreen API running' }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
