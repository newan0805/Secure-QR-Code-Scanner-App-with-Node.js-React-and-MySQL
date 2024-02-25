const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const bcrypt = require('bcrypt');
const mysql = require('mysql');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = 8000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'default-secret',
    resave: true,
    saveUninitialized: true
}));
app.use(helmet());
app.use(cors());

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
    } else {
        console.log('Connected to MySQL database!');
    }
});

// Middleware for verifying JWT token
const authenticateToken = (req, res, next) => {
    const token = req.session.token;

    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'default-jwt-secret', (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        req.user = decoded;
        next();
    });
};

// Middleware for handling errors
const errorHandler = (err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
};

app.post('/signup', async (req, res) => {
    const { uname, pass, email, upic } = req.body;
    const checkQuery = 'SELECT * FROM users WHERE uname = ? OR email = ?';
    db.query(checkQuery, [uname, email], async (checkErr, checkResults) => {
        if (checkErr) {
            console.error('Error checking user existence:', checkErr);
            res.status(500).json({ error: 'Internal Server Error' });
        } else {
            if (checkResults.length > 0) {
                res.status(409).json({ error: 'Username or email already exists' });
            }
            else {
                const hashedPassword = await bcrypt.hash(pass, 10);
                const createQuery = 'INSERT INTO users (uname, pass, email, upic) VALUES (?, ?, ?, ?)';
                db.query(createQuery, [uname, hashedPassword, email, upic], (createErr, result) => {
                    if (createErr) {
                        console.error('Error creating user:', createErr);
                        res.status(500).json({ error: 'Internal Server Error' });
                    } else {
                        const token = jwt.sign({ uname }, process.env.JWT_SECRET || 'default-jwt-secret', { expiresIn: '1h' });
                        req.session.token = token;
                        res.status(200).json({ message: 'User created successfully', token });
                    }
                });
            }
        }
    });
});


app.post('/login', async (req, res) => {
    const { uname, pass } = req.body;
    const query = 'SELECT * FROM users WHERE uname = ? OR email = ?';

    db.query(query, [uname, uname], async (err, results) => {
        if (err) {
            console.error('Error fetching user:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        } else {
            if (results.length > 0) {
                const match = await bcrypt.compare(pass, results[0].pass);
                if (match) {
                    const token = jwt.sign({ uname }, process.env.JWT_SECRET || 'default-jwt-secret', { expiresIn: '1h' });
                    req.session.token = token;
                    res.status(200).json({message: 'Login successful', token });
                } else {
                    res.status(401).json({ error: 'Invalid credentials' });
                }
            } else {
                res.status(401).json({ error: 'Invalid credentials' });
            }
        }
    });
});

app.get('/items', authenticateToken, (req, res) => {

    const query = 'SELECT * FROM items';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching items:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        } else {
            const items = results.map(result => ({
                iname: result.iname,
                iqty: result.iqty,
                ipic: result.ipic
            }));
            res.status(200).json({message: 'Items successful', items });
        }
    });
});

app.get('/items/?', authenticateToken, (req, res) => {
    const uname = req.user.uname;

    // Fetch items from the database for the authenticated user
    const query = 'SELECT * FROM items WHERE iname = ?';
    db.query(query, [uname], (err, results) => {
        if (err) {
            console.error('Error fetching items:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        } else {
            const items = results.map(result => ({
                iname: result.iname,
                iqty: result.iqty,
                ipic: result.ipic
            }));
            res.status(200).json({message: 'Items successful', items });
        }
    });
});

app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        } else {
            res.status(200).json({ message: 'Logout successful' });
        }
    });
});

app.use(errorHandler);

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
