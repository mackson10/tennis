GameRoom = require("../games/GameRoom");
Player = require("./Player");
Ring = require("./Ring");
Projectile = require("./Projectile");

blocks = require("./blocks");

class SkwarzGame {
  constructor(gameIo, ticketsArray) {
    this.gameIo = gameIo;
    this.tickets = ticketsArray;
    this.waitingDelayedTime = 100;
    this.connectedPlayers = new GameRoom({
      minPlayers: 2,
      maxPlayers: ticketsArray.length
    });
    this.status = "waiting players";
    this.seed = Math.floor(Math.random() * 100000) + 1;
    this.gridSide = 20;
    this.maxGridRadius = 100;
    this.spawnGridRadius = 80;
    this.spawnRadius = this.spawnGridRadius * this.gridSide;
    this.maxRadius = this.maxGridRadius * this.gridSide;
    this.entities = {
      projectiles: new Map()
    };
    this.projectilesCount = 0;
    this.ring = new Ring(this);
    this.setIo();
  }

  setStatus(status) {
    this.status = status;
    console.log(status);
    switch (status) {
      case "waiting delayed":
        this.waitingDelayed = new Date().getTime();
        setTimeout(() => this.checkConnected(), this.waitingDelayedTime);
        break;
    }
  }

  setIo() {
    this.gameIo.on("connection", socket => {
      socket.on("enterGame", ticket => this.enterGame(socket, ticket));
    });
  }

  setSocket(socket) {
    socket.on("disconnect", reason => {
      if (socket.player) {
        this.leaveGame(socket.player);
      }
    });
    socket.on("movement", movement => {
      if (socket.player) {
        socket.player.move(movement);
      }
    });
    socket.on("shoot", direction => {
      if (socket.player && this.status === "running") {
        socket.player.shoot(direction);
      }
    });
  }

  enterGame(socket, playerTicket) {
    let validTicket = this.tickets.find(
      ticket =>
        ticket.id === playerTicket.id &&
        ticket.secret === playerTicket.secret &&
        !ticket.taken
    );

    if (validTicket) {
      const newPlayer = new Player(
        this,
        validTicket.id,
        validTicket.secret,
        socket
      );
      validTicket.taken = true;
      socket.player = newPlayer;
      this.connectedPlayers.join(newPlayer);
      socket.emit("waiting players");
      this.setSocket(socket);
      this.checkConnected();
    } else {
      socket.emit("not confirmed");
    }
  }

  leaveGame(player) {
    this.connectedPlayers.leave(player);
    this.checkConnected();
  }

  checkConnected() {
    const players = this.connectedPlayers;
    if (this.status === "waiting players" && players.playersEnough()) {
      this.setStatus("waiting delayed");
    } else if (
      (this.status === "waiting delayed" && players.isFull()) ||
      new Date().getTime() - this.waitingDelayed >= this.waitingDelayedTime
    ) {
      this.setupGame();
    } else if (
      players.size() < 2 &&
      !this.status === "waiting players" &&
      !this.status === "waiting delayed"
    ) {
      this.endGame();
    }
  }

  setupGame() {
    this.setStatus("setting up");
    this.initializePositions();
    this.sendSetup();
    setTimeout(() => this.startGame(), 3000);
  }

  sendSetup() {
    const formatedPlayers = Player.sendFormatArray(
      this.connectedPlayers.players
    );

    this.connectedPlayers.players.forEach(player => {
      const setupObject = {
        you: player.sendFormat(),
        players: formatedPlayers,
        seed: this.seed
      };

      const socket = player.socket;
      socket.emit("setup", setupObject);
    });
  }

  startGame() {
    this.setStatus("starting");
    this.loopTimer = setInterval(() => this.loopFunction(), 16);
  }

  loopFunction() {
    if (this.status === "starting") this.setStatus("running");
    this.interactions();
    this.sendState();
  }

  interactions() {
    Projectile.interactions(this.entities.projectiles, this);
    this.ring.interaction();
    Player.interactions(this.connectedPlayers.players);
  }

  sendState() {
    const formatedPlayers = Player.sendFormatArray(
      this.connectedPlayers.players,
      player => player.visible
    );

    const formatedProjectiles = Projectile.sendFormatArray(
      this.entities.projectiles
    );

    this.connectedPlayers.players.forEach(player => {
      const stateObject = {
        you: player.sendFormat(),
        players: formatedPlayers,
        projectiles: formatedProjectiles,
        seed: this.seed
      };

      const socket = player.socket;
      socket.emit("state", stateObject);
    });
  }

  createProjectile(player, options) {
    const { direction, width, height, speed, range } = options;
    const firstPosition = {
      x:
        player.position.x +
        player.position.width / 2 -
        width / 2 +
        speed * direction.x,
      y:
        player.position.y +
        player.position.height / 2 -
        height / 2 +
        speed * direction.y,
      width,
      height
    };

    const projectileOptions = {
      direction,
      position: firstPosition,
      speed,
      range
    };

    const newProjectile = new Projectile(player, projectileOptions);
    this.entities.projectiles.set(newProjectile.id, newProjectile);
  }

  initializePositions() {
    let x = -this.spawnRadius;
    let y = 0;
    let xInc = Math.trunc(this.spawnRadius / 10);
    let yInc = -Math.trunc(this.spawnRadius / 10);

    for (let player of this.connectedPlayers.array()) {
      player.position.width = this.gridSide - 4;
      player.position.height = this.gridSide - 4;

      while (!this.validPosition({ ...player.position, x, y })) {
        x += xInc >= 0 ? 1 : -1;
        y += yInc >= 0 ? 1 : -1;
      }

      player.position.x = x + 2;
      player.position.y = y + 2;

      x += xInc;
      y += yInc;

      if (Math.abs(x) >= this.spawnRadius) {
        xInc *= -1;
      }
      if (Math.abs(y) >= this.spawnRadius) {
        yInc *= -1;
      }
    }
  }

  validPosition(position) {
    let p1, p2, p3, p4;

    p1 = { x: position.x, y: position.y };
    p2 = {
      x: position.x + position.width,
      y: position.y + position.height
    };
    p3 = { x: position.x, y: position.y + position.height };
    p4 = { x: position.x + position.width, y: position.y };

    return (
      !this.calculateTerrain(p1.x, p1.y).solid &&
      !this.calculateTerrain(p2.x, p2.y).solid &&
      !this.calculateTerrain(p3.x, p3.y).solid &&
      !this.calculateTerrain(p4.x, p4.y).solid
    );
  }

  calculateTerrain(x, y) {
    const gridX = Math.floor(x / this.gridSide);
    const gridY = Math.floor(y / this.gridSide);

    if (this.ring.reached(gridX, gridY)) {
      return blocks.fire;
    }

    const terrainValue =
      Math.abs(Math.cos(gridX ** 1 / 2 + gridY ** 3 + this.seed ** 2)) * 100000;

    if (
      Math.abs(gridX) % ((this.seed % 50) + 25) < 5 &&
      Math.abs(gridY) % ((this.seed % 50) + 25) < 2
    ) {
      return blocks.wall;
    }

    if (terrainValue > 4000) {
      return blocks.dirt;
    } else if (terrainValue > 2000) {
      return blocks.bush;
    } else {
      return blocks.wall;
    }
  }
}

module.exports = SkwarzGame;
