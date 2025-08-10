require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const admin = require("firebase-admin");
const app = express();

const port = process.env.PORT || 3000;

app.use(express.json())
const allowedOrigins = [
  'http://localhost:5173',
  'https://tutor-booking--ass-11.web.app'
];

app.use(cors({
  origin: allowedOrigins,

  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));
//...fire base sevice key
const base64Key = process.env.FIREBASE_SERVICE_KEY;
const serviceAccountJSON = Buffer.from(base64Key, 'base64').toString('utf8');
const serviceAccount = JSON.parse(serviceAccountJSON);



admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

//...............

//tutiordb nkW32WukSUPjV86v

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.owvc9jc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});


async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    //...............................................
    // await client.connect();
    //.....................................................
    //crreate database of tutior
    const TutiorCollection = client.db('tutiorbook').collection('tutior')

    // create database of savedtutior
    const BookTutiorCollection = client.db('tutiorbook').collection('tutiorbooked')

    // create database for  register user 
    const UserCollection = client.db('tutiorbook').collection('users')

    //...set jwt firebase token


    // Middleware: Verify Firebase JWT.........................

    const verifyToken = async (req, res, next) => {
      console.log('verifyToken', req.headers)
      console.log(req.url)
      const authHeader = req.headers.authorization;
      console.log(" Incoming Headers:", req.headers); 

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).send("Unauthorized - Token missing");
      }

      const token = authHeader.split(" ")[1];
      console.log(" Incoming token:", token);

      try {
        const decodedUser = await admin.auth().verifyIdToken(token);
        req.user = decodedUser;
        next();
      } catch (err) {
        console.error("Token verification failed:", err.message);
        res.status(403).send("Forbidden - Invalid token");
      }
    };

    //................................

    // In your backend (express server)

    // Update the ensureUserInDatabase middleware to always track users
    const ensureUserInDatabase = async (req, res, next) => {
      if (req.user?.email) {
        try {
          // Check if user exists
          const existingUser = await UserCollection.findOne({ email: req.user.email });

          // If new user, add to database
          if (!existingUser) {
            await UserCollection.insertOne({
              email: req.user.email,
              name: req.user.name || "Anonymous",
              createdAt: new Date(),
              role: 'student' // Default role
            });
            console.log(` New user registered: ${req.user.email}`);
          }
        } catch (err) {
          console.error("User registration error:", err.message);
        }
      }
      next(); // Always continue
    };

    // Add a new endpoint to get detailed user stats
    app.get('/userstats', async (req, res) => {
      try {
        const totalUsers = await UserCollection.estimatedDocumentCount();
        const totalTutors = await TutiorCollection.estimatedDocumentCount();
        const activeUsers = await UserCollection.countDocuments({
          lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
        });

        res.send({
          totalUsers,
          totalTutors,
          activeUsers,
          studentCount: totalUsers - totalTutors
        });
      } catch (err) {
        console.error("Error fetching user stats:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    //update and delete
    app.delete('/addtutior/:id', async (req, res) => {
      const id = req.params.id;
      try {
        const result = await TutiorCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 1) {
          res.status(200).send({ message: 'Tutor deleted successfully' });
        } else {
          res.status(404).send({ message: 'Tutor not found' });
        }
      } catch (error) {
        console.error('Delete Error:', error);
        res.status(500).send({ error: 'Internal Server Error' });
      }
    });

    // PATCH Tutor (Update selected fields)
    app.patch('/addtutior/:id', async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      try {
        const result = await TutiorCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );
        res.send(result);
      } catch (error) {
        console.error('Update Error:', error);
        res.status(500).send({ error: 'Internal Server Error' });
      }
    });

    // update review by patch
    app.patch('/tutor/:id/review', async (req, res) => {
      const { id } = req.params;
      console.log('/tutor/:id/review', req.params)
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: 'Invalid ID format' });
      }

      try {
        const objectId = new ObjectId(id);

        // Find tutor in main collection
        const tutor = await TutiorCollection.findOne({ _id: objectId });
        if (!tutor) {
          return res.status(404).send({ error: 'Tutor not found' });
        }

        let currentReview = Number(tutor.review);
        if (isNaN(currentReview)) currentReview = 0;
        const updatedReview = currentReview + 1;

        // Update tutor review count
        const resultTutor = await TutiorCollection.updateOne(
          { _id: objectId },
          { $set: { review: updatedReview } }
        );

        // Update booked tutors review count with ObjectId
        const bookedMatchCount = await BookTutiorCollection.countDocuments({ tutorId: objectId });
        console.log(`Booked tutors matching tutorId=${objectId}: ${bookedMatchCount}`);

        const resultBooked = await BookTutiorCollection.updateMany(
          { tutorId: objectId },
          { $set: { review: updatedReview } }
        );

        res.send({
          tutorUpdate: { matchedCount: resultTutor.matchedCount, modifiedCount: resultTutor.modifiedCount },
          bookedUpdate: { matchedCount: resultBooked.matchedCount, modifiedCount: resultBooked.modifiedCount },
          newReview: updatedReview
        });
      } catch (error) {
        console.error('Error updating review count:', error);
        res.status(500).json({ error: 'Server error' });
      }
    });


    //.............................................
    app.get('/auth/ping', verifyToken, ensureUserInDatabase, (req, res) => {
      res.send({ status: 'user verified and inserted if new' });
    });

    //  get use 
    app.get('/totalusers', async (req, res) => {
      const count = await UserCollection.estimatedDocumentCount();
      res.send({ totalUsers: count });
    });

    //read  sdd myy tutor data 
    app.get('/mytutors', verifyToken, ensureUserInDatabase, async (req, res) => {
      try {
        const userEmail = req.user.email;

        const result = await TutiorCollection.find({ email: userEmail }).toArray();
        res.send(result);
      } catch (err) {
        console.error("Error fetching my tutors:", err.message);
        res.status(500).send({ message: "Internal server error" });
      }
    });




    // read add data..........................

    app.get('/addtutior', async (req, res) => {
      try {

        const cursor = TutiorCollection.find()
        const result = await cursor.toArray()
        res.send(result)
      }
      catch (err) {
        console.error('Error fetching tutors:', error);
        res.status(500).send({ message: 'Internal server error' });
      }

    })

    //.....................................................
    // get user save tutior book

    app.get(
      '/savedtutor',
      verifyToken,
      ensureUserInDatabase,
      async (req, res) => {
        console.log('/savedtutor', req.user)
        try {
          const userEmail = req.user.email;
          console.log("Authenticated user:", req.user);

          const result = await BookTutiorCollection.find({
            studentEmail: userEmail
          }).toArray();

          res.send(result);
        } catch (err) {
          res.status(500).send("Server error");
        }
      });


    // add  dataa
    app.post('/savedtutor', verifyToken, async (req, res) => {
      try {
        const userEmail = req.user.email;
        const { _id, ...restTutor } = req.body; // Destructure _id and ignore it

        if (!_id) {
          return res.status(400).send({ message: "Missing tutor ID" });
        }

        // Check if this user has already booked this tutor
        const existing = await BookTutiorCollection.findOne({
          studentEmail: userEmail,
          tutorId: _id
        });

        if (existing) {
          return res.status(409).send({
            message: "Tutor already booked by you"
          });
        }

        // Insert new booking with original tutor ID stored separately
        const savedTutor = {
          ...restTutor,
          tutorId: _id, // keep reference to original tutor
          studentEmail: userEmail,
          bookedAt: new Date()
        };

        const result = await BookTutiorCollection.insertOne(savedTutor);
        res.send(result);
      } catch (err) {
        console.error("Booking error:", err);
        res.status(500).send("Server error");
      }
    });



    //add data of addtutior
    app.post('/addtutior', async (req, res) => {
      const newTutior = req.body;
      console.log(newTutior)
      const result = await TutiorCollection.insertOne(newTutior)
      res.send(result)
    })

    // Send a ping to confirm a successful connection

    //await client.db("admin").command({ ping: 1 });
    //console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {


    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);



//running server
app.get('/', (req, res) => {
  res.send('teacher booking server is ruuning ')
})
app.listen(port, () => {
  console.log(`app listing port ${port}`)
})