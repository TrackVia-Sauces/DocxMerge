class Log {
  log(message) {
    console.log(`---   ${message}   ---`);
  }

  error(message) {
    console.log(`---   ${message}   ---`);
  }

}

module.exports = new Log();
