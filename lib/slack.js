const request = require('request');
const slackNotify = require('slack-notify');

class Slack {
  constructor(hookUrl, token) {
    this.hookUrl = hookUrl;
    this.token = token;

    this.handler = slackNotify(hookUrl); //`${hookUrl}?token=${token}`);
  }

  getUsers(cb) {
    const options = {
      url: 'https://slack.com/api/users.list',
      qs: {
        token: this.token,
      }
    };

    request.get(options, (err, res, body) => {
      if (err) {
        return cb(err);
      }

      if (res.statusCode != 200) {
        return cb(new Error(`got status code: ${res.statusCode}`));
      }

      let jsonBody;
      try {
        jsonBody = JSON.parse(body);
      } catch (e) {
        return cb(e);
      }

      cb(null, jsonBody.members);
    });
  }

  send(channel, message, cb) {
    const options = {
      channel: channel,
      attachments: [{text: message.body, color: message.color}],
      unfurl_links: 1,
    };

    this.handler.send(options, (err) => {
      if (err) {
        return cb(err);
      }

      cb(null);
    });
  }
}

module.exports = Slack;

/* vim: set ts=2 sw=2 et: */
