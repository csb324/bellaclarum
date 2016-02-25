var _ = require('underscore');
_.mixin( require('underscore.deferred') );
var Twit = require('twit');
var ent = require('ent');
var rita = require('rita');
var ritaCore = rita.RiTa;
var RiMarkov = rita.RiMarkov;

var rm = new RiMarkov(3);
var rmReplies = new RiMarkov(3);

var T;

var newestID;

if (process.env.NODE_ENV == "production") {
  T = new Twit({
    consumer_key:         process.env.CONSUMER_KEY,
    consumer_secret:      process.env.CONSUMER_SECRET,
    access_token:         process.env.ACCESS_TOKEN,
    access_token_secret:  process.env.ACCESS_TOKEN_SECRET
  })
} else {
  T = new Twit(require('./config.js'));
};


Array.prototype.pick = function() {
  return this[Math.floor(Math.random()*this.length)];
};

Array.prototype.pickRemove = function() {
  var index = Math.floor(Math.random()*this.length);
  return this.splice(index,1)[0];
};


function getOriginalTweets(lastId) {
  console.log('searching');
  var dfd = new _.Deferred();
  var queryOptions = {
    screen_name: 'clarabellum',
    count: 200,
    trim_user: true,
    exclude_replies: false,
    include_rts: false
  };

  if (lastId) {
    queryOptions.max_id = lastId;
  };

  T.get('statuses/user_timeline', queryOptions, function(err, tweets) {
    if (err) {
      console.log('search error:',err);
    };
    tweetsText = _.chain(tweets)
      // decode weird characters
      .map(function(el) {
        if (el.retweeted_status) {
          return ent.decode(el.retweeted_status.text);
        }
        else {
          return ent.decode(el.text);
        }
      })
      .filter(function(el) {
        var noLinks = (el.search(/https?:/) == -1);

        return noLinks;
      })
      .uniq()
      .value();

    var response = {
      lastId: tweets[tweets.length - 1].id,
      firstId: tweets[0].id,
      tweetsText: tweetsText
    };

    dfd.resolve(response);
  });
  return dfd.promise();
}

function getMoreTweets(results, tweets, times) {
  var dfd = new _.Deferred();
  console.log(times);
  if (times == 0) {
    console.log(tweets.length);
    dfd.resolve(tweets);
  } else {
    getOriginalTweets(results.lastId).then(function(results2) {
      tweets = tweets.concat(results2.tweetsText);
      getMoreTweets(results2, tweets, (times - 1)).then(function(moreResults) {
        dfd.resolve(moreResults);
      })
    });
  }
  return dfd.promise();
}

function formatTokens(text) {
  text = text.toLowerCase();
  return text;
}

function loadText(tweets) {

  var noreplies = [];
  var replies = [];

  _.each(tweets, function(el) {
    el = formatTokens(el);

    if (el.match(/^@\w*?\W/)) {
      reply = el.replace(/^(@\w*?\W)+/g, "");
      if (!reply.match(/@\w*?\W/)) {
        replies.push(reply);
      }
    }

    el = el.replace(/^(@\w*?\W)+/, "");

    if (!el.match(/@\w/)) {
      noreplies.push(el);
    }

  });

  rm._loadSentences(noreplies);
  rmReplies._loadSentences(replies);

  return rm;
}

function tweet(sentences) {
  // console.log(sentences);

  var myTweet = sentences.pickRemove();

  if (process.env.NODE_ENV == "production") {
    T.post('statuses/update', { status: myTweet }, function(err, reply) {
      if (err) {
        console.log('error:', err);
      } else {
        console.log(myTweet);
        console.log('tweeted it!');
      }
    });
  } else {
    console.log(myTweet);
  }
}


function getLatestTweets() {
  var dfd = new _.Deferred();
  var queryOptions = {
    screen_name: 'clarabellum',
    count: 200,
    trim_user: true,
    exclude_replies: false,
    include_rts: false,
    since_id: newestID
  };

  T.get('statuses/user_timeline', queryOptions, function(err, tweets) {
    if (err) {
      console.log('search error:',err);
    };
    tweetsText = _.chain(tweets)
      // decode weird characters
      .map(function(el) {
        if (el.retweeted_status) {
          return ent.decode(el.retweeted_status.text);
        }
        else {
          return ent.decode(el.text);
        }
      })
      .filter(function(el) {
        var noLinks = (el.search(/https?:/) == -1);

        return noLinks;
      })
      .uniq()
      .value();

    newestID = tweets[0].id;
    dfd.resolve(tweetsText);
  });
  return dfd.promise();
}

function updateMarkov() {
  getLatestTweets().then(loadText);
}

function run() {
  if (rm.ready()) {
    // console.log("Markov is already set up");
    tweet(rm.generateSentences(10));

  } else {
    var tweets = []
    getOriginalTweets(false).then(function(results) {
      tweets = tweets.concat(results.tweetsText);
      newestID = results.firstId;
      getMoreTweets(results, tweets, 10).then(function(allTweets) {
        // console.log(allTweets);
        loadText(allTweets);
        // console.log(rm.ready());
        tweet(rm.generateSentences(10));
      });
    });
  }
};

// Tweet every 60 minutes
setInterval(function () {
  try {
    run();
  }
  catch (e) {
    console.log(e);
  }
}, 60 * 60 * 1000);

setInterval(updateMarkov, 60 * 60 * 24 * 1000);
run();
