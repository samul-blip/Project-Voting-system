const clients = new Set();
exports.addClient = (res) => { clients.add(res); res.on('close', () => clients.delete(res)); };
exports.broadcast = (data) => clients.forEach(c => c.write(`data: ${JSON.stringify(data)}\n\n`));