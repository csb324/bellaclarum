var _ = require('underscore');
_.mixin( require('underscore.deferred') );
var Twit = require('twit');
var ent = require('ent');
var rita = require('rita');
var ritaCore = rita.RiTa;
var rm = rita.RiMarkov;

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

function getOriginalTweets(lastId) {
  console.log('searching');
  var dfd = new _.Deferred();
  var queryOptions = {
    screen_name: 'clarabellum',
    count: 200,
    trim_user: true,
    exclude_replies: true,
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
        var noMentions = (el.search(/@[^\s]/) == -1);

        return noLinks && noMentions;
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

function showTweets() {
  var tweets = []

  getOriginalTweets(false).then(function(results) {
    tweets = tweets.concat(results.tweetsText);
    getOriginalTweets(results.lastId).then(function(results2) {
      tweets = tweets.concat(results2.tweetsText);
      getOriginalTweets(results2.lastId).then(function(results3) {
        tweets = tweets.concat(results3.tweetsText);
        getOriginalTweets(results3.lastId).then(function(results4) {
          tweets = tweets.concat(results4.tweetsText);
          console.log(tweets.length);

        });
      });
    });
  });
}

showTweets();
