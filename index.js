var _ = require('underscore');
_.mixin( require('underscore.deferred') );
var Twit = require('twit');
var wordfilter = require('wordfilter');
var ent = require('ent');
