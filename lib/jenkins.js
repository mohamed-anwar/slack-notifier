const request = require('request');

class Jenkins {
  constructor(baseUrl, user, token) {
    this.baseUrl = baseUrl;
    this.user = user;
    this.token = token;

    this.options = {
      auth: {
        user: this.user,
        pass: this.token,
        sendImmediately: true
      }
    }
  }

  getBuild(job, build, cb) {
    const options = Object.assign({
      url: `${this.baseUrl}/job/${job}/${build}/api/json`
    }, this.options);

    request.get(options, (err, res, body) => {
      if (err)
        return cb(err);

      if (res.statusCode != 200)
        return cb(new Error(`getBuild: got status code: ${res.statusCode}`));

      let jsonBody;
      try {
        jsonBody = JSON.parse(body)
      } catch (e) {
        return cb(new Error(`getBuild: failed to parse body: ${e}`))
      }

      cb(null, new JenkinsBuild(jsonBody));
    })
  }

  getUser(user, cb) {
    const options = Object.assign({
      url: `${this.baseUrl}/user/${user}/api/json`,
    }, this.options);

    request.get(options, (err, res, body) => {
      if (err)
        return cb(err);

      if (res.statusCode != 200)
        return cb(`getUser: got status code: ${res.statusCode}`);

      let jsonBody;
      try {
        jsonBody = JSON.parse(body)
        cb(null, new JenkinsUser(jsonBody));
      } catch (e) {
        cb(`getUser: failed to parse body: ${e}`)
      }
    });
  }
}

class JenkinsBuild {
  constructor(jsonObject) {
    Object.assign(this, jsonObject);
  }

  getChangelog() {
    return this.changeSets.map(set => set.items.map(item => {
        return {
          author: item.author.fullName,
          jenkinsUser: item.author.absoluteUrl.match(/[^/]*$/),
          email: item.authorEmail,
          commitId: item.commitId,
        };
      })
    ).reduce((acc, cur) => acc.concat(cur), []);
  }

  getAuthorSet() {
    const authorSet = {};
    const changelog = this.getChangelog();

    /* build a set of authors with their commits count */
    changelog.forEach(commit => {
      const id = commit.email;

      if (!authorSet[id]) {
        /* author is not in set */
        authorSet[id] = {
          name: commit.author,
          email: commit.email,
          jenkinsUser: commit.jenkinsUser,
          commitsCount: 0
        };
      }

      /* increment commits count */
      authorSet[id].commitsCount += 1;
    });

    return authorSet;
  }

  getParameter(id) {
    try {
      return this
        .actions
        .filter(e => e._class == 'hudson.model.ParametersAction')[0]
        .parameters
        .filter(e => e.name == id)[0]
        .value;
    } catch (e) {
      console.trace(e);
      return null;
    }
  }
}

class JenkinsUser {
  constructor(jsonObject) {
    Object.assign(this, jsonObject);
  }

  getEmail() {
    try {
      this.property
        .filter(prop => prop._class == 'hudson.tasks.Mailer$UserProperty')[0].address;
    } catch (e) {
      console.trace(e);
      return null;
    }
  }
}

module.exports = Jenkins;

/* vim: set ts=2 sw=2 et: */
