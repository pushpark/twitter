const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("server running at http://localhost:3000/  .....");
    });
  } catch (error) {
    console.log(error.message);
  }
};
initializer();

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashPw = await bcrypt.hash(password, 10);
  const getUserQuery = `
  SELECT * FROM 
    user
    WHERE 
    username ='${username}';`;
  const sameUser = await db.get(getUserQuery);
  if (sameUser === undefined) {
    if (password.length >= 6) {
      const regQuery = `
    INSERT INTO
    user (name,username,password, gender)
  VALUES
    (
      '${name}',
      '${username}',
      '${hashPw}',
      '${gender}');`;
      const registerResult = await db.run(regQuery);
      response.status(200);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//login api 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const userQuery = `
    SELECT * FROM user
    WHERE username='${username}'`;
  const user = await db.get(userQuery);
  if (user === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const pwMatched = await bcrypt.compare(password, user.password);
    if (pwMatched) {
      const payload = { userId: user.user_id };
      const jwtToken = jwt.sign(payload, "secrete_token");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//authorization
const authorizer = (request, response, next) => {
  let token;
  const header = request.headers["authorization"];
  if (header !== undefined) {
    token = header.split(" ")[1];
  }
  if (token === undefined) {
    response.status(401);

    response.send("Invalid JWT Token");
  } else {
    jwt.verify(token, "secrete_token", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.userId = payload.userId;
        next();
      }
    });
  }
};
function convertApi3(ob) {
  return {
    username: ob.username,
    tweet: ob.tweet,
    dateTime: ob.date_time,
  };
}

// api 3
app.get("/user/tweets/feed/", authorizer, async (request, response) => {
  const { userId } = request;
  const getQuery = `
  SELECT user.username,
        tweet.tweet,
        tweet.date_time
  FROM ((follower 
  INNER JOIN user ON follower.following_user_id = user.user_id)
  INNER JOIN tweet ON user.user_id=tweet.user_id)
  WHERE follower.follower_user_id=${userId}
  ORDER BY tweet.date_time DESC
  LIMIT 4
  OFFSET 0`;
  const result = await db.all(getQuery);
  response.send(result.map(convertApi3));
});

// api 4
app.get("/user/following/", authorizer, async (request, response) => {
  const { userId } = request;
  const getQuery = `
  SELECT user.name
  FROM (follower 
  INNER JOIN user ON follower.following_user_id = user.user_id)
  WHERE follower.follower_user_id=${userId}`;
  const result = await db.all(getQuery);
  response.send(result);
});
// api 5
app.get("/user/followers/", authorizer, async (request, response) => {
  const { userId } = request;
  const getQuery = `
  SELECT user.name
  FROM (follower 
  INNER JOIN user ON follower.follower_user_id = user.user_id)
  WHERE follower.following_user_id=${userId}`;
  const result = await db.all(getQuery);
  response.send(result);
});

//api 6
app.get("/tweets/:tweetId/", authorizer, async (request, response) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getFollowingQuery = `
  SELECT following_user_id
  FROM follower
  WHERE follower_user_id=${userId}`;
  const followingIds = await db.all(getFollowingQuery);
  const followingArray = followingIds.map((a) => a.following_user_id);
  const getTweetQuery = `
  SELECT * FROM 
  tweet 
  WHERE tweet_id =${tweetId}`;
  const tweet = await db.get(getTweetQuery);
  if (followingArray.includes(tweet.user_id)) {
    const likesQuery = `
    SELECT count(tweet_id) as likes
    FROM like
    WHERE tweet_id=${tweetId}`;
    const likes = await db.get(likesQuery);
    const repliesQuery = `
    SELECT count(tweet_id) as replies
    FROM reply
    WHERE tweet_id=${tweetId}`;
    const replies = await db.get(repliesQuery);
    console.log(replies);

    const result = {
      tweet: tweet.tweet,
      likes: likes.likes,
      replies: replies.replies,
      dateTime: tweet.date_time,
    };

    response.send(result);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//api 7
app.get("/tweets/:tweetId/likes/", authorizer, async (request, response) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getFollowingQuery = `
  SELECT following_user_id
  FROM follower
  WHERE follower_user_id=${userId}`;
  const followingIds = await db.all(getFollowingQuery);
  const followingArray = followingIds.map((a) => a.following_user_id);
  const getTweetQuery = `
  SELECT * FROM 
  tweet 
  WHERE tweet_id = ${tweetId}`;
  const tweet = await db.get(getTweetQuery);
  if (followingArray.includes(tweet.user_id)) {
    const likesQuery = `
    SELECT user.username
    FROM (like 
        INNER JOIN user ON like.user_id=user.user_id)
    WHERE like.tweet_id=${tweetId}`;
    const likesUsernames = await db.all(likesQuery);
    console.log(likesUsernames);
    const result = { likes: likesUsernames.map((a) => a.username) };
    response.send(result);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//api 8
app.get("/tweets/:tweetId/replies/", authorizer, async (request, response) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getFollowingQuery = `
  SELECT following_user_id
  FROM follower
  WHERE follower_user_id=${userId}`;
  const followingIds = await db.all(getFollowingQuery);
  const followingArray = followingIds.map((a) => a.following_user_id);
  const getTweetQuery = `
  SELECT * FROM 
  tweet 
  WHERE tweet_id = ${tweetId}`;
  const tweet = await db.get(getTweetQuery);
  if (followingArray.includes(tweet.user_id)) {
    const repliesQuery = `
    SELECT user.name,
           reply.reply
    FROM (reply 
        INNER JOIN user ON reply.user_id=user.user_id)
    WHERE reply.tweet_id=${tweetId}`;
    const replyNames = await db.all(repliesQuery);
    console.log(replyNames);
    const result = { replies: replyNames };
    response.send(result);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//api9
app.get("/user/tweets/", authorizer, async (request, response) => {
  const { userId } = request;
  const getQuery = `
    SELECT tweet.tweet,
    COUNT(DISTINCT like.like_id) AS likes,
    COUNT(DISTINCT reply.reply_id) AS replies,
    tweet.date_time AS dateTime
    FROM ((tweet
    LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id)
    LEFT JOIN like ON tweet.tweet_id = like.tweet_id)
    WHERE tweet.user_id=${userId}
    GROUP BY tweet.tweet_id`;
  const result = await db.all(getQuery);
  response.send(result);
});
//api10
app.post("/user/tweets/", authorizer, async (request, response) => {
  const { userId } = request;
  const dateTime = new Date();
  const { tweet } = request.body;
  const postQuery = `
  INSERT INTO tweet(
      tweet,user_id)
      VALUES('${tweet}', ${userId})
  `;
  const result = await db.run(postQuery);
  response.send("Created a Tweet");
});

//API11
app.delete("/tweets/:tweetId/", authorizer, async (request, response) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getQuery = `
  SELECT user_id
  FROM tweet
  WHERE tweet_id=${tweetId}`;
  const tweet = await db.get(getQuery);
  if (userId === tweet.user_id) {
    const deleteQuery = `
    DELETE FROM tweet
    WHERE tweet_id=${tweetId}`;
    await db.run(deleteQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});
module.exports = app;
