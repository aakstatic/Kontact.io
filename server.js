const express = require("express");
const bodyParser = require("body-parser");
const { instrument } = require("@socket.io/admin-ui");
const checkWord = require("check-word");
const words = checkWord("en");
const io = require("socket.io")(5000, {
  cors: {
    origin: ["http://localhost:3000", "https://admin.socket.io"],
  },
});
const app = express();

let activeRooms = {};

// let activeGames={
//   roomcode:{
//     gameMasterWord:,
//     roundTime:,
//     checkForDictionary:,
//     wordLength:,
//     revealedWord:,
//     guessedWords:,
//     currContactData:{
//       contactWord:,
//       clue:,
//       thisContactTime:,
//       otherPlayerGuesses: [{name:,playerId:,guess:}],
//       gameMasterGuesses: [],
//     }
//   }
// }

let activeGames = {};

let socketMapForHost = {};
let socketMapForPlayer = {};
let playerNames = {};

const removePlayer = async ({ playerId, socket }) => {
  if (socket === null || socket === undefined) {
    const sockets = await io.in(playerId).fetchSockets();
    socket = sockets[0];
  }
  socket.leave(socketMapForPlayer[playerId]);
  activeRooms[socketMapForPlayer[playerId]].players = activeRooms[
    socketMapForPlayer[playerId]
  ].players.filter((player) => {
    return player.id !== playerId;
  });
  if (activeRooms[socketMapForPlayer[playerId]].players.size === 0) {
    delete activeRooms[socketMapForHost[playerId]];
  } else {
    io.in(activeRooms[socketMapForPlayer[playerId]].roomCode).emit(
      "players-update",
      activeRooms[socketMapForPlayer[playerId]]
    );
  }
  socket.emit("clear-data");
  delete socketMapForPlayer[playerId];
};

io.on("connection", (socket) => {
  //   console.log(socket.id);
  socket.on("game-created", (gameVars) => {
    if (socketMapForPlayer[socket.id]) {
      removePlayer({ playerId: socket.id, socket: socket });
    }
    // if (socketMapForHost[socket.id]) {
    //   socket.leave(socketMapForHost[socket.id]);
    //   delete activeRooms[socketMapForHost[socket.id]];
    //   delete socketMapForHost[socket.id];
    // }

    let roomCode;
    do {
      roomCode = Math.floor(Math.random() * 900000 + 100000);
    } while (roomCode in activeRooms);
    socketMapForPlayer[socket.id] = roomCode;
    playerNames[socket.id] = gameVars.name;
    activeRooms[roomCode] = {
      roomCode: roomCode,
      gameMasterId: socket.id,
      time: gameVars.time,
      wordLength: gameVars.wordLength,
      gameStarted: false,
      checkDictionaryWords: gameVars.checkDictionaryWords,
      players: [
        {
          name: gameVars.name,
          id: socket.id,
        },
      ],
    };
    socket.join(roomCode);
    socket.emit("game-hosted", activeRooms[roomCode]);
  });

  socket.on("player-joined", (roomCode, name, sendAlert) => {
    roomCode = parseInt(roomCode);
    if (activeRooms[roomCode] && activeRooms[roomCode].gameStarted) {
      sendAlert("Game has already start,Please wait for it to finish.");
    } else if (activeRooms[roomCode]) {
      if (socketMapForPlayer[socket.id]) {
        removePlayer({ playerId: socket.id, socket: socket });
      }
      playerNames[socket.id] = name;
      socketMapForPlayer[socket.id] = roomCode;
      socket.join(roomCode);
      activeRooms[roomCode].players = [
        ...activeRooms[roomCode].players,
        { name: name, id: socket.id },
      ];
      io.in(roomCode).emit("game-hosted", activeRooms[roomCode]);
    } else {
      sendAlert("The room code is invalid");
    }
  });
  const events = ["player-left"];
  events.forEach((event) => {
    socket.on(event, () => {
      // console.log(socket.id);
      if (
        // activeRooms[socketMapForPlayer[socket.id]].gameMasterId === socket.id
        true
      ) {
        if (
          activeRooms[socketMapForPlayer[socket.id]].players[0].id === socket.id
        ) {
          if (activeRooms[socketMapForPlayer[socket.id]].players.size > 1) {
            activeRooms[socketMapForPlayer[socket.id]].gameMasterId =
              activeRooms[socketMapForPlayer[socket.id]].players[1].id;
          }
        } else {
          activeRooms[socketMapForPlayer[socket.id]].gameMasterId =
            activeRooms[socketMapForPlayer[socket.id]].players[0].id;
        }
      }
      removePlayer({ playerId: socket.id, socket: socket });
      console.log("player left");
      // if (event === "player-left") alertPlayer();
    });
  });
  socket.on("kick-player", async (playerId) => {
    if (activeRooms[socketMapForPlayer[playerId]].gameMasterId === playerId) {
      activeRooms[socketMapForPlayer[playerId]].gameMasterId =
        activeRooms[socketMapForPlayer[playerId]].players[0].id;
    }
    const sockets = await io.in(playerId).fetchSockets();
    sockets[0].emit("player-is-kicked");
    removePlayer({ playerId: playerId, socket: null });
  });

  socket.on("make-gamemaster", (playerId) => {
    activeRooms[socketMapForPlayer[playerId]].gameMasterId = playerId;
    io.in(activeRooms[socketMapForPlayer[playerId]].roomCode).emit(
      "players-update",
      activeRooms[socketMapForPlayer[playerId]]
    );
  });

  socket.on("start-game", (sendAlert) => {
    activeRooms[socketMapForPlayer[socket.id]].gameStarted = true;
    activeGames[socketMapForPlayer[socket.id]] = {
      roundTime: activeRooms[socketMapForPlayer[socket.id]].time,
      checkDictionaryWords:
        activeRooms[socketMapForPlayer[socket.id]].checkDictionaryWords,
      wordLength: activeRooms[socketMapForPlayer[socket.id]].wordLength,
    };
    console.log(activeGames);
    io.in(socketMapForPlayer[socket.id]).emit("send-alert-for-game-started");
  });

  socket.on("secret-word", (secretWord, sendAlert) => {
    console.log(`Secret word : ${secretWord}`);
    console.log(activeGames);
    console.log(
      activeGames[socketMapForPlayer[socket.id]].wordLength,
      secretWord.length
    );
    if (
      secretWord.length >
      parseInt(activeGames[socketMapForPlayer[socket.id]].wordLength)
    ) {
      sendAlert("The word exceeds the maximum word length!");
    } else if (
      activeGames[socketMapForPlayer[socket.id]].checkDictionaryWords &&
      !words.check(secretWord)
    ) {
      //check if dictionary if not sendAlert() for the mistake
      sendAlert(
        "The word is not a dictionary word! Please use only dictionary words"
      );
    } else {
      activeGames[socketMapForPlayer[socket.id]].gameMasterWord = secretWord;
      activeGames[socketMapForPlayer[socket.id]].revealedWord =
        secretWord.substr(0, 1);
      console.log(
        `the revealed word ${
          activeGames[socketMapForPlayer[socket.id]].revealedWord
        }`
      );
      socket.broadcast
        .to(socketMapForPlayer[socket.id])
        .emit(
          "set-revealed-word",
          activeGames[socketMapForPlayer[socket.id]].revealedWord
        );
      io.in(socketMapForPlayer[socket.id]).emit("gamemaster-word-received");
    }
  });

  socket.on("make-contact", ({ codeWord, clue }) => {
    if (
      activeGames[socketMapForPlayer[socket.id]].currContactData === undefined
    ) {
      activeGames[socketMapForPlayer[socket.id]].currContactData = {
        contactWord: codeWord,
        clue: clue,
        thisContactTime: 10,
        otherPlayerGuesses: [],
        gameMasterGuesses: [],
        playerName: playerNames[socket.id],
      };
      io.in(socketMapForPlayer[socket.id]).emit(
        "display-code",
        playerNames[socket.id],
        clue
      );
    } else {
      //curr round is going on
    }
  });

  socket.on("match-contact", (guess) => {
    if (socket.id === activeRooms[socketMapForPlayer[socket.id]].gameMasterId) {
      activeGames[
        socketMapForPlayer[socket.id]
      ].currContactData.gameMasterGuesses.push(guess);
      let wasCorrect = false;
      if (
        guess ===
        activeGames[socketMapForPlayer[socket.id]].currContactData.contactWord
      ) {
        wasCorrect = true;
      }
      socket.emit(
        "break-contact-attempt",
        wasCorrect,
        guess,
        activeGames[socketMapForPlayer[socket.id]].currContactData,
        playerNames[socket.id]
      );
    } else {
      activeGames[
        socketMapForPlayer[socket.id]
      ].currContactData.otherPlayerGuesses.push(guess);
      let wasCorrect = false;
      // console.log(guess,activeG);
      if (
        guess ===
        activeGames[socketMapForPlayer[socket.id]].currContactData.contactWord
      ) {
        wasCorrect = true;
      }
      socket.emit(
        "make-contact-attempt",
        wasCorrect,
        guess,
        activeGames[socketMapForPlayer[socket.id]].currContactData,
        playerNames[socket.id]
      );
    }
  });
});

instrument(io, {
  auth: false,
});
//app.get("/", (req, res) => {
//res.send("working like a charm");
// })
// app.listen(5000, () => {
//   console.log("server is listening on port 5000");
// })
