(() => {
    "use strict";

    const COLS = 10;
    const ROWS = 20;
    const BLOCK = 30;
    const PREVIEW_BLOCK = 24;
    const SCORE_TABLE = [0, 100, 300, 500, 800];
    const HIGH_SCORE_KEY = "wk-tetris-high-score";

    const SHAPES = {
        I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
        J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
        L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
        O: [[1, 1], [1, 1]],
        S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
        T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
        Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]]
    };

    const COLORS = {
        I: "#43d9e8",
        J: "#4b6fff",
        L: "#ff9f31",
        O: "#f4dc3d",
        S: "#5bd66f",
        T: "#a46bff",
        Z: "#ff5e6c"
    };

    const canvas = document.getElementById("game");
    const context = canvas.getContext("2d");
    const nextCanvas = document.getElementById("next");
    const nextContext = nextCanvas.getContext("2d");
    const scoreElement = document.getElementById("score");
    const linesElement = document.getElementById("lines");
    const levelElement = document.getElementById("level");
    const highScoreElement = document.getElementById("high-score");
    const overlay = document.getElementById("overlay");
    const overlayKicker = document.getElementById("overlay-kicker");
    const overlayTitle = document.getElementById("overlay-title");
    const overlayMessage = document.getElementById("overlay-message");
    const primaryAction = document.getElementById("primary-action");
    const pauseButton = document.getElementById("pause-button");
    const restartButton = document.getElementById("restart-button");
    const statusElement = document.getElementById("game-status");

    let board = createBoard();
    let current = null;
    let nextType = null;
    let bag = [];
    let score = 0;
    let totalLines = 0;
    let level = 1;
    let highScore = readHighScore();
    let dropInterval = 850;
    let dropCounter = 0;
    let lastTime = 0;
    let animationId = 0;
    let started = false;
    let paused = false;
    let ended = false;

    function createBoard() {
        return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    }

    function readHighScore() {
        try {
            return Number.parseInt(localStorage.getItem(HIGH_SCORE_KEY), 10) || 0;
        } catch (_) {
            return 0;
        }
    }

    function saveHighScore() {
        if (score <= highScore) return;
        highScore = score;
        try {
            localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
        } catch (_) {
            // The game still works when local storage is unavailable.
        }
    }

    function shuffle(items) {
        for (let index = items.length - 1; index > 0; index -= 1) {
            const target = Math.floor(Math.random() * (index + 1));
            [items[index], items[target]] = [items[target], items[index]];
        }
        return items;
    }

    function takeFromBag() {
        if (bag.length === 0) {
            bag = shuffle(Object.keys(SHAPES));
        }
        return bag.pop();
    }

    function createPiece(type) {
        const shape = SHAPES[type].map((row) => row.slice());
        return {
            type,
            shape,
            x: Math.floor((COLS - shape[0].length) / 2),
            y: type === "I" ? -1 : 0
        };
    }

    function spawnPiece() {
        const type = nextType || takeFromBag();
        nextType = takeFromBag();
        current = createPiece(type);
        drawNext();
        if (collides(current)) {
            finishGame();
        }
    }

    function collides(piece, offsetX = 0, offsetY = 0, shape = piece.shape) {
        for (let y = 0; y < shape.length; y += 1) {
            for (let x = 0; x < shape[y].length; x += 1) {
                if (!shape[y][x]) continue;
                const boardX = piece.x + x + offsetX;
                const boardY = piece.y + y + offsetY;
                if (boardX < 0 || boardX >= COLS || boardY >= ROWS) return true;
                if (boardY >= 0 && board[boardY][boardX]) return true;
            }
        }
        return false;
    }

    function mergePiece() {
        current.shape.forEach((row, y) => {
            row.forEach((filled, x) => {
                if (!filled) return;
                const boardY = current.y + y;
                if (boardY >= 0) board[boardY][current.x + x] = current.type;
            });
        });
    }

    function clearLines() {
        let cleared = 0;
        for (let y = ROWS - 1; y >= 0; y -= 1) {
            if (board[y].every(Boolean)) {
                board.splice(y, 1);
                board.unshift(Array(COLS).fill(null));
                cleared += 1;
                y += 1;
            }
        }
        if (cleared === 0) return;
        totalLines += cleared;
        level = Math.floor(totalLines / 10) + 1;
        score += SCORE_TABLE[cleared] * level;
        dropInterval = Math.max(110, 850 - (level - 1) * 72);
        updateStats();
        announce(`消除 ${cleared} 行，当前分数 ${score}`);
    }

    function lockPiece() {
        const reachedTop = current.shape.some((row, y) =>
            row.some((filled) => filled && current.y + y < 0)
        );
        mergePiece();
        if (reachedTop) {
            finishGame();
            draw();
            return;
        }
        clearLines();
        spawnPiece();
        dropCounter = 0;
    }

    function move(horizontal) {
        if (!canPlay() || collides(current, horizontal, 0)) return;
        current.x += horizontal;
        draw();
    }

    function softDrop() {
        if (!canPlay()) return;
        if (collides(current, 0, 1)) {
            lockPiece();
        } else {
            current.y += 1;
            score += 1;
            updateStats();
        }
        dropCounter = 0;
        draw();
    }

    function hardDrop() {
        if (!canPlay()) return;
        let distance = 0;
        while (!collides(current, 0, 1)) {
            current.y += 1;
            distance += 1;
        }
        score += distance * 2;
        updateStats();
        lockPiece();
        draw();
    }

    function rotate() {
        if (!canPlay() || current.type === "O") return;
        const rotated = current.shape[0].map((_, index) =>
            current.shape.map((row) => row[index]).reverse()
        );
        const kickOffsets = [0, -1, 1, -2, 2];
        for (const offset of kickOffsets) {
            if (!collides(current, offset, 0, rotated)) {
                current.x += offset;
                current.shape = rotated;
                draw();
                return;
            }
        }
    }

    function canPlay() {
        return started && !paused && !ended && current;
    }

    function startGame() {
        cancelAnimationFrame(animationId);
        board = createBoard();
        bag = [];
        current = null;
        nextType = null;
        score = 0;
        totalLines = 0;
        level = 1;
        dropInterval = 850;
        dropCounter = 0;
        lastTime = performance.now();
        started = true;
        paused = false;
        ended = false;
        pauseButton.disabled = false;
        pauseButton.textContent = "暂停";
        hideOverlay();
        updateStats();
        spawnPiece();
        draw();
        announce("游戏开始");
        canvas.focus({ preventScroll: true });
        animationId = requestAnimationFrame(update);
    }

    function togglePause() {
        if (!started || ended) return;
        paused = !paused;
        pauseButton.textContent = paused ? "继续" : "暂停";
        if (paused) {
            showOverlay("BREAK", "游戏暂停", "休息一下，准备好再继续", "继续游戏");
            announce("游戏已暂停");
        } else {
            hideOverlay();
            lastTime = performance.now();
            announce("游戏继续");
        }
    }

    function finishGame() {
        ended = true;
        paused = false;
        saveHighScore();
        updateStats();
        pauseButton.disabled = true;
        showOverlay("GAME OVER", "方块到顶了", `最终得分 ${score}，再来一次？`, "再玩一次");
        announce(`游戏结束，最终得分 ${score}`);
    }

    function showOverlay(kicker, title, message, actionLabel) {
        overlayKicker.textContent = kicker;
        overlayTitle.textContent = title;
        overlayMessage.textContent = message;
        primaryAction.textContent = actionLabel;
        overlay.classList.remove("hidden");
    }

    function hideOverlay() {
        overlay.classList.add("hidden");
    }

    function announce(message) {
        statusElement.textContent = message;
    }

    function updateStats() {
        saveHighScore();
        scoreElement.textContent = score.toLocaleString("zh-CN");
        linesElement.textContent = totalLines.toLocaleString("zh-CN");
        levelElement.textContent = level.toLocaleString("zh-CN");
        highScoreElement.textContent = highScore.toLocaleString("zh-CN");
    }

    function update(time = 0) {
        if (!started || ended) return;
        const delta = time - lastTime;
        lastTime = time;
        if (!paused) {
            dropCounter += delta;
            if (dropCounter >= dropInterval) {
                if (collides(current, 0, 1)) {
                    lockPiece();
                } else {
                    current.y += 1;
                }
                dropCounter = 0;
            }
            draw();
        }
        animationId = requestAnimationFrame(update);
    }

    function drawBlock(target, x, y, color, size, alpha = 1) {
        target.save();
        target.globalAlpha = alpha;
        target.fillStyle = color;
        target.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
        target.fillStyle = "rgba(255,255,255,0.22)";
        target.fillRect(x * size + 3, y * size + 3, size - 6, 3);
        target.fillStyle = "rgba(0,0,0,0.18)";
        target.fillRect(x * size + size - 5, y * size + 3, 2, size - 6);
        target.restore();
    }

    function drawMatrix(target, shape, offsetX, offsetY, color, size, alpha = 1) {
        shape.forEach((row, y) => {
            row.forEach((filled, x) => {
                if (filled) drawBlock(target, x + offsetX, y + offsetY, color, size, alpha);
            });
        });
    }

    function drawGrid() {
        context.strokeStyle = "rgba(255,255,255,0.045)";
        context.lineWidth = 1;
        for (let x = 1; x < COLS; x += 1) {
            context.beginPath();
            context.moveTo(x * BLOCK + 0.5, 0);
            context.lineTo(x * BLOCK + 0.5, canvas.height);
            context.stroke();
        }
        for (let y = 1; y < ROWS; y += 1) {
            context.beginPath();
            context.moveTo(0, y * BLOCK + 0.5);
            context.lineTo(canvas.width, y * BLOCK + 0.5);
            context.stroke();
        }
    }

    function ghostY() {
        if (!current) return 0;
        let offset = 0;
        while (!collides(current, 0, offset + 1)) offset += 1;
        return current.y + offset;
    }

    function draw() {
        context.fillStyle = "#080b14";
        context.fillRect(0, 0, canvas.width, canvas.height);
        drawGrid();
        board.forEach((row, y) => {
            row.forEach((type, x) => {
                if (type) drawBlock(context, x, y, COLORS[type], BLOCK);
            });
        });
        if (!current) return;
        drawMatrix(context, current.shape, current.x, ghostY(), COLORS[current.type], BLOCK, 0.16);
        drawMatrix(context, current.shape, current.x, current.y, COLORS[current.type], BLOCK);
    }

    function drawNext() {
        nextContext.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
        if (!nextType) return;
        const shape = SHAPES[nextType];
        const width = shape[0].length * PREVIEW_BLOCK;
        const height = shape.length * PREVIEW_BLOCK;
        const offsetX = (nextCanvas.width - width) / (2 * PREVIEW_BLOCK);
        const offsetY = (nextCanvas.height - height) / (2 * PREVIEW_BLOCK);
        drawMatrix(nextContext, shape, offsetX, offsetY, COLORS[nextType], PREVIEW_BLOCK);
    }

    function handleAction(action) {
        const actions = {
            left: () => move(-1),
            right: () => move(1),
            down: softDrop,
            rotate,
            drop: hardDrop
        };
        if (actions[action]) actions[action]();
    }

    document.addEventListener("keydown", (event) => {
        const key = event.key.toLowerCase();
        const controlledKeys = ["arrowleft", "arrowright", "arrowdown", "arrowup", "a", "d", "s", "w", " "];
        if (controlledKeys.includes(key)) event.preventDefault();

        if (key === "enter" && (!started || ended)) {
            startGame();
            return;
        }
        if ((key === "p" || key === "escape") && started && !ended) {
            togglePause();
            return;
        }
        if (!canPlay()) return;

        if (key === "arrowleft" || key === "a") move(-1);
        if (key === "arrowright" || key === "d") move(1);
        if (key === "arrowdown" || key === "s") softDrop();
        if (key === "arrowup" || key === "w") rotate();
        if (key === " ") hardDrop();
    });

    primaryAction.addEventListener("click", () => {
        if (paused && !ended) togglePause();
        else startGame();
    });
    pauseButton.addEventListener("click", togglePause);
    restartButton.addEventListener("click", startGame);

    document.querySelectorAll("[data-action]").forEach((button) => {
        button.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            handleAction(button.dataset.action);
        });
    });

    document.addEventListener("visibilitychange", () => {
        if (document.hidden && canPlay()) togglePause();
    });

    highScoreElement.textContent = highScore.toLocaleString("zh-CN");
    draw();
})();
