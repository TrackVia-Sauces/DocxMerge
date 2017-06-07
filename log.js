class Log {
  log(message) {
    console.log(`---   ${message}   ---`);
  }

  error(message) {
    console.log(`---   ERROR: ${message}   ---`);
  }

}

module.exports = new Log();
