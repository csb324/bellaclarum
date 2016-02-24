var _ = require('underscore');
_.mixin( require('underscore.deferred') );
var Twit = require('twit');
var ent = require('ent');
var rita = require('rita');
var ritaCore = rita.RiTa;
var rm = new rita.RiMarkov(3);

var T;
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
      .map(function(el) {
        var isReply = (el.search(/@[^\s]*/) == 0);
        if (isReply) {
          return el.replace(/@[^\s]*/, "[REPLY]");
        } else {
          return el;
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

function setUpMarkov(tweets) {
  var text = tweets.join(". ");
  console.log(text);


  rm.loadText(text);
  console.log(rm);

  return rm;
}

function tweet(sentences) {
  var myTweet = sentences.pickRemove();

  T.post('statuses/update', { status: myTweet }, function(err, reply) {
    if (err) {
      console.log('error:', err);
      if (sentences.length > 0) {
        tweet(sentences);
      }
    } else {
      console.log(myTweet);
      console.log('tweeted it!');
    }
  });
}

function run() {
  if (rm.ready()) {
    tweet(rm.generateSentences(10));

  } else {
    var tweets = []
    getOriginalTweets(false).then(function(results) {
      tweets = tweets.concat(results.tweetsText);
      getMoreTweets(results, tweets, 10).then(function(allTweets) {
        setUpMarkov(allTweets);
        tweet(rm.generateSentences(10));
      });
    });
  }
};

run();
