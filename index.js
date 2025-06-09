const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: [
      'https://seabattleyrm.web.app',
      'http://localhost:3000',
      'http://localhost:3002',
      'http://localhost:3003',
      'https://battleship-server.onrender.com'
    ],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Инициализация Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

app.use(cors({
  origin: [
    'https://seabattleyrm.web.app',
    'http://localhost:3000',
    'http://localhost:3002',
    'http://localhost:3003',
    'https://battleship-server.onrender.com'
  ],
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

// Создание новой игры
app.post('/createGame', async (req, res) => {
  try {
    const gameId = Math.random().toString(36).substring(2, 8);
    const gameRef = db.collection('games').doc(gameId);
    
    await gameRef.set({
      players: [req.body.playerId],
      boards: {},
      gameKey: null,
      status: 'waiting',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ gameId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Подготовка к игре
app.post('/ready', async (req, res) => {
  try {
    const { gameId, gameKey, board, playerId } = req.body;
    const gameRef = db.collection('games').doc(gameId);
    const gameDoc = await gameRef.get();

    if (!gameDoc.exists) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    const game = gameDoc.data();
    game.boards[playerId] = board;
    game.gameKey = gameKey;

    if (game.players.length === 1) {
      await gameRef.update({
        boards: game.boards,
        gameKey: gameKey
      });
      res.json({ status: 'waiting', gameKey });
    } else if (game.players.length === 2) {
      await gameRef.update({
        boards: game.boards,
        status: 'playing'
      });
      res.json({ status: 'playing', player1: game.players[0], player2: game.players[1] });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Присоединение к игре
app.post('/joinGame', async (req, res) => {
  try {
    const { gameKey, playerId } = req.body;
    const gamesRef = db.collection('games');
    const snapshot = await gamesRef.where('gameKey', '==', gameKey).get();

    if (snapshot.empty) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    const gameDoc = snapshot.docs[0];
    const game = gameDoc.data();

    if (game.players.length >= 2) {
      return res.status(400).json({ error: 'Игра уже заполнена' });
    }

    await gameDoc.ref.update({
      players: admin.firestore.FieldValue.arrayUnion(playerId)
    });

    res.json({ gameId: gameDoc.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Получение состояния игры
app.get('/game/:gameId', async (req, res) => {
  try {
    const gameDoc = await db.collection('games').doc(req.params.gameId).get();
    
    if (!gameDoc.exists) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    res.json(gameDoc.data());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Socket.IO обработчики
io.on('connection', (socket) => {
  console.log('Пользователь подключился:', socket.id);

  socket.on('disconnect', () => {
    console.log('Пользователь отключился:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
}); 