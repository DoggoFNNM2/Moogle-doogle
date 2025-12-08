// In-memory store. For production, replace with a database.
const games = new Map();

/**
 * Game structure:
 * {
 *   code: string,
 *   hostSocketId: string,
 *   players: Map(socketId -> {name, avatar, mochi}),
 *   questions: [{q, options: [A,B,C,D], answerIndex: 0-3}],
 *   currentQuestionIndex: number,
 *   phase: 'waiting'|'question'|'chest'|'finished'
 * }
 */

function createGame(code, hostSocketId, questions = []) {
  const game = {
    code,
    hostSocketId,
    players: new Map(),
    questions,
    currentQuestionIndex: -1,
    phase: 'waiting'
  };
  games.set(code, game);
  return game;
}

function getGame(code) {
  return games.get(code);
}

function deleteGame(code) {
  games.delete(code);
}

function listPlayers(game) {
  return Array.from(game.players.entries()).map(([id, p]) => ({ socketId: id, ...p }));
}

module.exports = {
  createGame,
  getGame,
  deleteGame,
  listPlayers
};