const express = require("express")
const app = express()
const path = require('path')

app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname + '/index.html'))
})

app.use('/public',express.static(path.join(__dirname, 'public')));

var port = process.env.PORT || 5000
app.listen(port, function() {
  console.log("Listening on " + port)
})