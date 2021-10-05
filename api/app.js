const express = require('express');
const app = express();

const {mongoose} = require('./db/mongoose');

const bodyParser = require('body-parser');

// Load in the mongoose models
const { List, Task, User } = require('./db/models');

const jwt = require('jsonwebtoken');

/** MIDDLEWARE **/

// Load middleware
app.use(bodyParser.json());

// CORS HEADERS MIDDLEWARE
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS, PUT, PATCH, DELETE");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-access-token, x-refresh-token, _id");

    res.header(
        'Access-Control-Expose-Headers',
        'x-access-token, x-refresh-token'
    );

    next();
});

// check whether the request has a valid JWT access token
let authenticate = ( req, res, next ) => {
    let token = req.header('x-access-token');

    // verify the JWT
    jwt.verify(token, User.getJWTSecret(), (err, decoded) => {
        if (err) {
            // there was an error
            // jwt is invalid - do not authenticate
            res.status(401).send(err);
        } else {
            // the jwt is valid
            req.user_id = decoded._id;
            next();
        }

    });
};

// Verify refresh token middleware (which will be verifying the session)
let verifySession = (req, res, next) => {
    //grab refresh token from the request header
    let refreshToken = req.header('x-refresh-token');
    console.log(refreshToken);
    //grab the _id from the request header
    let _id = req.header('_id');

    User.findByIdAndToken(_id, refreshToken).then((user) => {
        if (!user) {
            // user couldn't be found
            return Promise.reject({
                'error': 'User not found. Make sure that the refresh token and the user id are correct'
            });
        }

        //if code reaches here - the user was found
        //therefore the refresh token exists in the database
        //we still have to check if it has expired or not
        req.user_id = user._id;
        req.refreshToken = refreshToken;
        req.userObject = user;

        let isSessionValid = false;

        user.sessions.forEach((session) => {
            if (session.token === refreshToken) {
                //check if session has expired
                if (User.hasRefreshTokenExpired(session.expiresAt) === false) {
                    //refresh token has not expired
                    isSessionValid = true;
                }
            }
        });
        if (isSessionValid) {
            //the session is valid - call next() to continue with processing the web request
            next();
        } else {
            // the session is not valid
            return Promise.reject({
                'error': 'The refresh token has expired or the session is invalid.'
            });
        }
    }).catch((e) => {
        res.status(401).send(e);
    });
};

/* ROUTE HANDLERS */

/* LIST ROUTES */

/**
 * GET /lists
 * Purpose: get all lists
 */
app.get('/lists', authenticate, (req, res) => {
    // Return array of all the lists in database that belong to the authenticated user
    List.find({
        _userId: req.user_id
    }).then((lists) => {
       res.send(lists);
    });
});

/**
 * GET /lists
 * Purpose: Get a specific list
 */
app.get('/lists/:listId/tasks/:taskId', (req, res) => {
   Task.findOne({
      _id: req.params.taskId,
      _listId: req.params.listId
   }).then((task) => {
     res.send(task);
   });
});

/**
 * POST /lists
 * Purpose: Create a list
 */
app.post('/lists', authenticate, (req, res) => {
    // Create new list and return new list document back to the user (includes id)
    // The list information (fields) will be passed in via the JSON request body
    let title = req.body.title;

    let newList = new List({
       title,
        _userId: req.user_id
    });
    newList.save().then((listDoc) => {
       // the full list document is returned (incl. id)
       res.send(listDoc);
    });
});

/**
 * PATCH /lists/:id
 * Purpose: Update a specified list
 */
app.patch('/lists/:id', authenticate, (req, res) => {
   // Update the specified list (list document with id in the URL) wit the new values specified in the JSON body of the request
    List.findOneAndUpdate({_id: req.params.id, _userId: req.user_id }, {
        $set: req.body
    }).then(() => {
        res.send({
            'message': 'Updated successfully!'
        });
    });
});

/**
 * DELETE /lists/:id
 * Purpose: Delete a list
 */
app.delete('/lists/:id', authenticate, (req, res) => {
   // Delete the specified list (document with id in the URL)
    List.findOneAndRemove({
       _id: req.params.id,
        _userId: req.user_id
    }).then((removedListDoc) => {
        res.send(removedListDoc);

        // delete all the tasks that are in the deleted list
        deleteTasksFromList(removedListDoc._id);
    });
});

/**
 * GET /lists/:listId/tasks
 * Purpose: Get all tasks in a specific list
 */
app.get('/lists/:listId/tasks', authenticate, (req, res) => {
   // Return all tasks that belong to a specific list
    Task.find({
       _listId: req.params.listId
    }).then((tasks) => {
        res.send(tasks);
    });
});

/**
 * POST /lists/:listId/tasks
 * Purpose: Create a new task in a specific list
 */
app.post('/lists/:listId/tasks', authenticate, (req, res) => {
    // Create a new task in a list specified by listId

    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((list) => {
        if (list) {
            // list object with the specified conditions was found
            // user object is valid, therefore the currently authenticated user can create new tasks
            return true;
        }
        // list object is undefined
        return false;
    }).then((canCreateTask) => {
        if (canCreateTask) {
            let newTask = new Task({
               title: req.body.title,
               _listId: req.params.listId
            });
            newTask.save().then((newTaskDoc) => {
               res.send(newTaskDoc);
            });
        } else {
            res.sendStatus(404);
        }
    });
});

/**
 * PATCH /lists/:listId/tasks/:taskId
 * Purpose: Update an existing task
 */
app.patch('/lists/:listId/tasks/:taskId', authenticate, (req, res) => {
   // Update an existing task specified by taskId

    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((list) => {
        if (list) {
            // list object with the specified conditions was found
            // user object is valid, therefore the currently authenticated user can make updates to tasks within this list
            return true;
        }
        // list object is undefined
        return false;
    }).then((canUpdateTasks) => {
        if ( canUpdateTasks ) {
            // the currently authenticated user can update tasks
           Task.findOneAndUpdate({
               _id: req.params.taskId,
               _listId: req.params.listId
            }, {
               $set: req.body
           }).then(() => {
               res.send({ message: 'Updated successfully.' })
           });
        } else {
            res.sendStatus(404);
        }
    });

});

/**
 * DELETE /lists/:listId/tasks/:taskId
 * Purpose: Delete a task
 */
app.delete('/lists/:listId/tasks/:taskId', authenticate, (req, res) => {
    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((list) => {
        if (list) {
            // list object with the specified conditions was found
            // user object is valid, therefore the currently authenticated user can make updates to tasks within this list
            return true;
        }
        // list object is undefined
        return false;
    }).then((canDeleteTasks) => {
        if ( canDeleteTasks ) {
            Task.findOneAndRemove({
              _id: req.params.taskId,
              _listId: req.params.listId
           }).then((removedTaskDoc) => {
               res.send(removedTaskDoc);
           });
        } else {
            res.sendStatus(404);
        }
    });
});

/* USER ROUTES */

/**
 * POST /users
 * Purpose: Signup
 */
app.post('/users', (req, res) => {
   //user signup
    let body = req.body;
    let newUser = new User(body);

    newUser.save().then(() => {
       return newUser.createSession();
    }).then((refreshToken) => {
        //session created successfully - refreshToken returned
        // now we generate an access auth token for the user
        return newUser.generateAccessAuthToken().then((accessToken) => {
            // access auth token generated successfully. no w we return an object containing the auth tokens
           return { accessToken, refreshToken }
        }).then((authToken) => {
            //construct and send the response to the user with their auth tokens in the header and the user object in the body
            res
                .header('x-refresh-token', authToken.refreshToken)
                .header('x-access-token', authToken.accessToken)
                .send(newUser);
        }).catch((e) => {
            res.status(400).send(e);
        });
    });
});

/**
 * POST /users/login
 * Purpose: Login
 */
app.post('/users/login', (req, res) => {
   let email = req.body.email;
   let password = req.body.password;

   User.findByCredentials(email, password).then((user) => {
      return user.createSession().then((refreshToken) => {
         //session created successfully - refreshToken returned
         //generate an access auth token for the user
         return user.generateAccessAuthToken().then((accessToken) => {
             return { accessToken, refreshToken }
         }).then((authToken) => {
             res
                 .header('x-refresh-token', authToken.refreshToken)
                 .header('x-access-token', authToken.accessToken)
                 .send(user);
         });
      });
   }).catch((e) => {
       res.status(400).send(e);
   });
});

/**
 * GET /users/me/access-token
 * Purpose: Generates and returns an access token
 */
app.get('/users/me/access-token', verifySession, (req, res) => {
    //we know that the user/caller is authenticated and we have the user_id and userObject available to us
    req.userObject.generateAccessAuthToken().then((accessToken) => {
        res.header('x-access-token', accessToken).send({ accessToken });
    }).catch((e) => {
        res.status(400).send(e);
    });
});

/** HELPER METHODS **/
let deleteTasksFromList = (_listId) => {
    Task.deleteMany({
        _listId
    }).then(() => {
        console.log('Tasks from ' + _listId + ' were deleted.');
    });
};

app.listen(3000, () => {
    console.log("Server listening on port 3000");
});
