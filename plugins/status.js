/**
 * The status plugin shows status information for each repository.
 */
var fs = require('fs'),
    path = require('path'),
    style = require('../lib/style.js'),
    run = require('../lib/run.js'),
    commandRequirements = require('../lib/command-requirements.js');

var exec = require('child_process').exec;

module.exports = function(req, res, next) {
  var cwd = req.path,
      tags,
      dirname = path.dirname(cwd).replace(req.gr.homePath, '~') + path.sep,
      repos = (req.gr.directories ? req.gr.directories : []),
      pathMaxLen = repos.reduce(function(prev, current) {
        return Math.max(prev, current.replace(req.gr.homePath, '~').length + 2);
      }, 0);

  function pad(s, len) {
    return (s.toString().length < len ?
      new Array(len - s.toString().length).join(' ') : '');
  }

  // force human format, makes commandRequirements print out when skipping
  if (!commandRequirements.git({ format: 'json', path: cwd })) {

    console.log(
      style(dirname, 'gray') +
      style(path.basename(cwd), 'white') +
      pad(dirname + path.basename(cwd), pathMaxLen) + ' ' +
      style('Missing .git directory', 'red')
    );
    return req.done();
  }

  // search for matching tags
  tags = req.gr.getTagsByPath(cwd);

  if (req.argv.length > 0 && req.argv[0] == '-v') {
    console.log(
      style('\nin ' + dirname, 'gray') +
      style(path.basename(cwd), 'white') + '\n'
      );

    run(['git', '-c', 'color.status=always', 'status', '-sb'], cwd, req.done);
  } else {
    var task = exec('git status --branch --porcelain && echo "---" && git stash list && echo "---" && git status', {
        cwd: cwd,
        maxBuffer: 1024 * 1024 // 1Mb
      }, function(err, stdout, stderr) {
        var rawLines = stdout.split('\n').filter(function(line) {
          return !!line.trim();
        });

        var outputs = divideArrays(rawLines);
        var lines = outputs[0]; // status

        //remove the branch info so it isn't counted as a change
        var branchInfo = lines.shift();

        // process stashes
        var stashes = outputs[1].filter( function(line) {
            return line.match(/^stash@.*/)
        });

        // parse
        var behind = (branchInfo || '').match(/(\[.+\])/g) || '',
            stashed = (stashes.length > 0 ? stashes.length + ' stashes' : '')
            modified = (lines.length > 0 ?
              lines.length + ' modified' :
              'Clean'
            );

        var branchName = branchInfo.slice(3).split('...', 1)[0];
        if (branchName.includes("no branch")) {
          branchName = outputs[2][0]
        }

        console.log(
          style(dirname, 'gray') +
          style(path.basename(cwd), 'white') + pad(dirname + path.basename(cwd), pathMaxLen) + ' ' +
          branchName + pad(branchName, 32) + ' ' +
          style(modified, (lines.length > 0 ? 'red' : 'green')) + pad(modified, 14) +
          behind + pad(behind, 14) +
          style(stashed, (stashes.length > 0 ? 'red' : 'green')) + pad(stashed, 14) +
          tags.map(function(s) { return '@' + s; }).join(' ')
        );
        if (err !== null) {
          console.log('exec error: ' + err);
          if (stderr) {
            console.log('stderr: ' + stderr);
          }
        }
        req.done();
      });
  }
};

function divideArrays(lines) {
    const resultArrays = [];
    let currentArray = [];

    for (const line of lines) {
        if (line === "---") {
            resultArrays.push(currentArray);
            currentArray = [];
        } else {
            currentArray.push(line);
        }
    }

    // Push the last array, even if it doesn't end with "----"
    if (currentArray.length > 0) {
        resultArrays.push(currentArray);
    }

    return resultArrays;
}
