GameRoom = require("../games/GameRoom");

class TennisGame {
  constructor(gameIo, ticketsArray) {
    this.gameIo = gameIo;
    this.tickets = ticketsArray;
    this.minPlayers = 2;
    this.connectedPlayers = new GameRoom({
      minPlayers: this.minPlayers,
      maxPlayers: this.minPlayers
    });
    this.balls = new Map();
    this.width = 500;
    this.height = 500;
    this.status = "waiting players";
    this.ballsCount = 0;
    this.entities = { projectiles: new Map() };
    this.projectilesCount = 0;
    this.setIo();
  }

  setStatus(status) {
    this.status = status;
    switch (status) {
      case "":
        break;
    }
  }

  setIo() {
    this.gameIo.on("connection", socket => {
      socket.on("enterGame", ticket => this.enterGame(socket, ticket));
    });
  }

  enterGame(socket, playerTicket) {
    let validTicket = this.tickets.find(
      ticket => ticket.id === playerTicket.id && !ticket.taken
    );

    if (validTicket && validTicket.secret === playerTicket.secret) {
      const player = { ...validTicket, socket };
      validTicket.taken = true;
      socket.player = player;
      this.connectedPlayers.join(player);
      socket.emit("waiting players");
      this.setSocket(socket);
      this.checkConnected();
    } else {
      socket.emit("not confirmed");
    }
  }

  setSocket(socket) {
    socket.on("disconnect", reason => {
      if (socket.player) {
        this.leaveGame(socket.player);
      }
    });
    socket.on("move", movement => {
      if (this.status === "running") this.movePlayer(socket.player, movement);
    });
    socket.on("shoot", _ => {
      if (this.status === "running") this.shoot(socket.player);
    });
  }

  checkConnected() {
    this.sendPlayersCount();
    if (
      this.connectedPlayers.size() >= this.minPlayers &&
      this.status === "waiting players"
    ) {
      this.setupGame();
    } else if (
      this.connectedPlayers.size() < this.minPlayers &&
      this.status !== "waiting players" &&
      this.status !== "end game"
    ) {
      const winner = this.connectedPlayers.array()[0];
      this.endGame(this[winner.role]);
    }
  }

  leaveGame(player) {
    this.connectedPlayers.leave(player);
    this.checkConnected();
  }

  endGame(winner) {
    this.setStatus("end game");
    clearInterval(this.timer);
    clearInterval(this.ballTimer);
    setTimeout(
      () => this.gameIo.emit("endGame", { winner, ...this.state }),
      100
    );
  }

  movePlayer(player, movement) {
    if (!player || (player.role != "P2" && player.role != "P1")) return false;

    const movingPlayer = this[player.role];
    const newState = { ...movingPlayer.state };

    newState[movement.axis] += movement.delta;

    if (
      Math.abs(movingPlayer.state.x - newState.x) <= 15 &&
      newState.x + movingPlayer.state.width / 2 >= 0 &&
      newState.x + movingPlayer.state.width / 2 <= this.width
    )
      movingPlayer.state.x = newState.x;
    else {
      this.correctState(movingPlayer);
    }
  }

  sendPlayersCount() {
    this.gameIo.emit("players", { connectedPlayers: this.connectedPlayers });
  }

  startGame() {
    this.setStatus("starting");
    this.gameIo.emit("start");
    this.ballTimer = setInterval(() => this.createBall(), 20000);
    this.timer = setInterval(() => this.loopFunction(), 15);
    this.setStatus("running");
  }

  setupGame() {
    this.setStatus("setting up");
    const players = this.connectedPlayers.array();
    this.P1 = {
      role: "P1",
      pid: players[0].id,
      state: { width: 180, height: 45, x: 160, y: -30 },
      gameInfo: { points: 0, color: "blue", lifes: 10 }
    };
    this.P2 = {
      role: "P2",
      pid: players[1].id,
      state: { width: 180, height: 45, x: 160, y: 485 },
      gameInfo: { points: 0, color: "yellow", lifes: 10 }
    };

    players[0].role = "P1";
    players[1].role = "P2";

    this.createBall();

    this.gameIo.emit("setup", this.setupObject());
    setTimeout(() => {
      this.setStatus("start");
      this.startGame();
    }, 3000);
  }

  loopFunction() {
    this.interactions();
    this.sendState();
  }

  interactions() {
    this.ballsInteractions();
    this.entitiesInteractions();
  }

  ballsInteractions() {
    Array.from(this.balls).forEach(([id, ball]) => {
      if (ball.x + ball.size > this.width) {
        ball.x = this.width - ball.size;
        ball.vx *= -1;
      } else if (ball.x - ball.size < 0) {
        ball.x = ball.size;
        ball.vx *= -1;
      }

      if (ball.y - ball.size > this.height) {
        this.losingBall(this.P2, ball);
      } else if (ball.y + ball.size < 0) {
        this.losingBall(this.P1, ball);
      }

      if (this.checkPlayerCollision(this.P1, ball, "ball")) {
        this.touchingBall(ball, this.P1);
      }
      if (this.checkPlayerCollision(this.P2, ball, "ball")) {
        this.touchingBall(ball, this.P2);
      }
      ball.x += ball.vx;
      ball.y += ball.vy;
    });
  }

  checkPlayerCollision(player, object, type) {
    const playerState = player.state;

    switch (type) {
      case "ball":
        const ball = object;
        return (
          ball.x + ball.size * 2 >= playerState.x &&
          ball.x - ball.size * 2 <= playerState.x + playerState.width &&
          ball.y + ball.size * 2 >= playerState.y &&
          ball.y - ball.size * 2 <= playerState.y + playerState.height
        );
      default:
        return (
          object.x + object.width >= playerState.x &&
          object.x <= playerState.x + playerState.width &&
          object.y + object.height >= playerState.y &&
          object.y <= playerState.y + playerState.height
        );
    }
  }

  entitiesInteractions() {
    Array.from(this.entities.projectiles).forEach(([id, bullet]) => {
      bullet.y += bullet.vy;

      if (bullet.y - bullet.size > this.height) {
        this.entities.projectiles.delete(bullet.id);
      } else if (bullet.y + bullet.size < 0) {
        this.entities.projectiles.delete(bullet.id);
      }

      if (this.checkPlayerCollision(this.P1, bullet)) {
        this.playerGrow(this.P1, -1);
        setTimeout(() => this.entities.projectiles.delete(bullet.id), 1000);
      }
      if (this.checkPlayerCollision(this.P2, bullet)) {
        this.playerGrow(this.P2, -1);
        setTimeout(() => this.entities.projectiles.delete(bullet.id), 1000);
      }
    });
  }

  playerGrow(player, delta) {
    let newWidth = player.state.width;
    newWidth += delta;
    if (newWidth < 45) {
      newWidth = 45;
      delta = 45 - player.state.width;
    }

    player.state.width = newWidth;
    player.state.x -= delta / 2;
    this.correctState(player);
  }

  losingBall(player, ball) {
    player.gameInfo.lifes--;
    this.playerGrow(player, 15);
    this.balls.delete(ball.id);
    if (player.gameInfo.lifes < 1) {
      if (player.role === "P2") {
        this.endGame(this.P1);
      }
      if (player.role === "P1") {
        this.endGame(this.P2);
      }
    }
    if (this.balls.size < 2) this.createBall();
  }

  touchingBall(ball, player) {
    const objState = player.state;
    let touchX =
      (ball.x + ball.size / 2 - (objState.x + objState.width / 2)) /
      (objState.width / 2);
    touchX = touchX > 1 ? 1 : touchX;
    touchX = touchX < -1 ? -1 : touchX;

    let bonus = 1;
    if (Math.abs(touchX) < 0.2) {
      bonus = 2;
    }
    touchX *= 0.7;
    ball.vx = touchX * ball.speed;
    ball.vy =
      (1 - Math.abs(touchX)) *
      ball.speed *
      bonus *
      (player.role === "P1" ? 1 : -1);

    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.lastTouch !== player.role) {
      ball.lastTouch = player.role;
      ball.color = player.gameInfo.color;
      ball.speed *= 1 + 1 / ball.speed / 10;
      this.playerGrow(player, -10);
      player.gameInfo.points += 1;
    }
  }

  createBall() {
    const rvx = 0;
    const rvy = 5 * (Math.random() > 0.5 ? -1 : 1);
    const rsize = Math.random() * 5 + 5;
    const newBall = {
      id: ++this.ballsCount,
      size: rsize,
      x: 250,
      y: 250,
      vx: rvx,
      vy: rvy,
      speed: 10,
      color: "black"
    };
    this.balls.set(newBall.id, newBall);
  }

  shoot(_player) {
    const player = this[_player.role];

    if (player.lastShot && new Date().getTime() - player.lastShot <= 3000)
      return;

    const newBullet = {
      id: ++this.projectilesCount,
      x: player.state.x + player.state.width / 2,
      y:
        player.state.y +
        (player.role === "P1" ? player.state.height + 25 : -25),
      owner: player,
      vy: player.role === "P1" ? 6 : -6,
      width: 15,
      height: 25
    };
    this.entities.projectiles.set(newBullet.id, newBullet);
    player.lastShot = new Date().getTime();
  }

  setupObject() {
    return this.stateObject();
  }

  correctState(player) {
    const socket = this.connectedPlayers.search(player.pid).socket;
    socket.emit("correctState", player.state);
  }

  stateObject() {
    return {
      players: {
        [this.P1.pid]: {
          id: this.P1.pid,
          role: "P1",
          state: this.P1.state,
          gameInfo: this.P1.gameInfo
        },
        [this.P2.pid]: {
          id: this.P2.pid,
          role: "P2",
          state: this.P2.state,
          gameInfo: this.P2.gameInfo
        }
      },
      balls: Array.from(this.balls).map(([_, ball]) => ball),
      projectiles: Array.from(this.entities.projectiles).map(
        ([_, bullet]) => bullet
      ),
      time: new Date().getTime()
    };
  }
  sendState() {
    this.gameIo.emit("state", this.stateObject());
  }
}

module.exports = TennisGame;
