GameRoom = require("./GameRoom");

class GameQueue {
  constructor(app, io, options, initGame) {
    this.path = options.path;
    this.app = app;
    this.queueRooms = new Map();
    this.queueRoomsCount = 0;
    this.players = new Map();
    this.tickets = {};
    this.ticketsCount = 0;
    this.roomOptions = options.room;
    this.waitingDelayedTime = options.waitingDelayedTime;
    this.waitingDelayed = 0;
    this.io = io;
    this.initFunction = initGame;
    this.status = "waiting";
    this.setRoutes();
    this.setIo();
  }

  setRoutes() {
    const { app, path } = this;
    app.get(path + "/queue", (req, res) => this.queueRequest(req, res));
  }

  queueRequest(req, res) {
    const ticket = {
      id: ++this.ticketsCount,
      secret: "secret#" + Math.random() * 1000000000000000000,
      path: this.io.name
    };
    this.tickets[ticket.id] = ticket;
    res.send(ticket);
  }

  setIo() {
    this.io.on("connection", socket => {
      socket.on("confirm", ticket => {
        const confirmed = this.confirmQueue(ticket, socket);
        if (confirmed) {
          const room = confirmed.room;
          socket.emit("waiting on queue", {
            playersCount: room.size()
          });
          socket.join(room.id);
          socket.ticket = ticket;
          this.checkRoom(room);
        } else {
          socket.emit("not confirmed");
        }

        socket.on("disconnect", reason => {
          if (socket.ticket) {
            this.leaveQueue(socket.ticket);
          }
        });
      });
    });
  }

  leaveQueue(ticket) {
    const player = this.players.get(ticket.id);
    const playerRoom = player.room;
    playerRoom.leave(player);
    this.players.delete(player.id);
  }

  checkRoom(room) {
    if (room.playersEnough()) {
      room.initTimer = setTimeout(
        () => this.initGame(room),
        this.waitingDelayedTime
      );
    }

    if (room.isFull()) {
      if (room.initTimer) {
        clearTimeout(room.initTimer);
      }
      this.initGame(room);
    }
    this.io.to(room.id).emit("players", room.size());
  }

  initGame(room) {
    const roomTickets = {
      roomId: room.id,
      array: room.array().map(player => ({ ...player.ticket }))
    };
    this.initFunction(roomTickets);
    this.queueRooms.delete(room.id);
  }

  confirmQueue(ticket, socket) {
    const theTicket = this.tickets[ticket.id];
    if (theTicket && theTicket.secret === ticket.secret) {
      let playerRoom = GameRoom.available(this.queueRooms);

      if (!playerRoom) {
        playerRoom = new GameRoom({
          ...this.roomOptions,
          id: ++this.queueRoomsCount
        });
        this.queueRooms.set(playerRoom.id, playerRoom);
      }

      const newPlayer = { ...ticket, ticket, socket, room: playerRoom };
      playerRoom.join(newPlayer);
      this.players.set(newPlayer.id, newPlayer);
      return newPlayer;
    } else return false;
  }
}

module.exports = GameQueue;
