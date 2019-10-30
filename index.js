const express = require('express');

const util = require('./lib/util');
const Jenkins = require('./lib/jenkins');
const Slack = require('./lib/slack');

const jenkinsBaseUrl = process.env.JENKINS_BASE_URL;
const jenkinsUser    = process.env.JENKINS_USER;
const jenkinsToken   = process.env.JENKINS_TOKEN;
const slackToken     = process.env.SLACK_TOKEN;
const slackWebhook   = process.env.SLACK_WEBHOOK;

const jenkins = new Jenkins(jenkinsBaseUrl, jenkinsUser, jenkinsToken);
const slack = new Slack(slackWebhook, slackToken);

slack.onError = function (err) {
  console.error(`Slack API error: ${err}`);
};

const slackBaseUrl = 'https://slack.com';
const app = express();

var slackUserIdCache = {};

function resolveIds(users, cb) {
  if (Object.keys(slackUserIdCache) == 0) {
    /* build cache */
    slack.getUsers((err, members) => {
      if (err) {
        console.error(err);
        return cb(err);
      }

      members.forEach(user => {
        if (user.profile.email) {
          const email = util.normalizeEmail(user.profile.email);
          slackUserIdCache[email] = user.id;
        }
      });

      return resolveIds(users, cb);
    });
  } else {
    var promises = [];

    Object.keys(users).forEach(id => {
      const user = users[id];

      const email = util.normalizeEmail(user.email);

      if (!slackUserIdCache[email]) {
        /* id is not in the cache -- try to fetch email from jenkins */

        /* scatter promises */
        promises.push(new Promise((resolve, reject) => {
          jenkins.getUser(user.jenkinsUser, (err, jenkinsUser) => {
            if (err) {
              console.error(err)
              return resolve();
            }

            if (!jenkinsUser.getEmail()) {
              console.error('Jenkins did not return email for user', jenkinsUser);
              return resolve();
            }

            const jenkinsEmail = util.normalizeEmail(jenkinsUser.getEmail());

            if (slackUserIdCache[jenkinsEmail]) {
              slackUserIdCache[email] = slackUserIdCache[jenkinsEmail];
              users[id].id = slackUserIdCache[email];
            }

            resolve();
          });
        }));
      }

      users[id].id = slackUserIdCache[email];
    });

    /* gather all scattered promises */
    Promise.all(promises)
    .then(() => cb(null, users))
    .catch((err) => {console.error(err); cb(err);});
  }
}

function buildMessage(job, build, cb) {
  jenkins.getBuild(job, build, (err, jenkinsBuild) => {
    if (err) {
      cb(err);
      return;
    }

    const commits = jenkinsBuild.getChangelog();
    const authorSet = jenkinsBuild.getAuthorSet();

    resolveIds(authorSet, (err, authorSet) => {
      /* construct message body */
      var messageColor = "";
      var messageBody = "";

      const buildNumber = 

      messageBody += `${job} - #${jenkinsBuild.id}`;

      if (jenkinsBuild.result == 'SUCCESS') {
        messageBody += ' Success';
        messageColor = 'good';
      } else {
        messageBody += ' Failure';
        messageColor = 'danger';
      }

      messageBody += ` after ${jenkinsBuild.duration / 1000} sec (<${jenkinsBuild.url}|Open>)\n`;

      if (Object.keys(authorSet) == 0) {
        messageBody += '*No changes.*\n'
      } else {
        messageBody += `*Changelog*: (${commits.length} commits)\n`

        Object.keys(authorSet).forEach(key => {
          const author = authorSet[key];

          messageBody += '• ';
          messageBody += author.id? `<@${author.id}>` : author.name;
          messageBody += ` [${author.commitsCount} commits]\n`;
        });
      }

      /* add release notes to message body if available */
      const releaseNotes = jenkinsBuild.getParameter('releaseNotes');
      if (releaseNotes && releaseNotes.length > 0) {
        messageBody += `*Release Notes*:\n${releaseNotes}\n`;
      }

      cb(null, {color: messageColor, body: messageBody});
    });
  });
}

app.get('/get/:job/:build', (req, res) => {
  const job = req.params.job;
  const build = req.params.build;

  buildMessage(job, build, (err, messageBody) => {
    if (err) {
      console.error(err);
      return res.status(500).end("an error occured");
    }

    res.end(JSON.stringify(messageBody));
  });
});

app.get('/notify/:job/:build', (req, res) => {
  const job = req.params.job;
  const build = req.params.build;
  const channel = req.query.channel || defaultChannel;

  buildMessage(job, build, (err, message) => {
    if (err) {
      console.error(err);
      return res.status(500).end("an error occured");
    }

    const options = {
      channel: channel.startsWith('#')? channel : '#' + channel,
      attachments: [{text: message.body, color: message.color}],
      unfurl_links: 1,
    };

    slack.send(channel, message, (err) => {
      if (err) {
        console.error(err);
        return res.status(500).end("an error occured");
      }

      res.end("OK");
    });

  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`started listening on port: ${PORT}`);
});

/* vim: set ts=2 sw=2 et: */
