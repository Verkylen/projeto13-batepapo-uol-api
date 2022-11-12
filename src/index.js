import express, { json } from 'express';
import { MongoClient } from 'mongodb';
import cors from 'cors';
import dotenv from 'dotenv';
import dayjs from 'dayjs';
import joi from 'joi';

dotenv.config();

const app = express();
app.use(cors());
app.use(json());

const mongoClient = new MongoClient(process.env.MONGO_URI);
let participants;
let messages;

mongoClient.connect().then(() => {
    const db = mongoClient.db('API_Bate-papo_OUL');
    participants = db.collection('participants');
    messages = db.collection('messages');
});

app.post('/participants', (req, res) => {
    
    // function postBodyError() {
    //     res.sendStatus(422);
    //     return;
    // }

    // if (!req.hasOwnProperty('body')) {
    //     postBodyError();
    // } else if(!req.body.hasOwnProperty('name')) {
    //     postBodyError();
    // } else if(req.body.name === '') {
    //     postBodyError();
    // }

    const {name} = req.body;

    participants.insertOne({name, lastStatus: Date.now()});

    const hour = dayjs().hour().toString().padStart(2, 0);
    const minute = dayjs().minute().toString().padStart(2, 0);
    const second = dayjs().second().toString().padStart(2, 0);

    const systemMessage = {
        from: name,
        to: 'Todos',
        text: 'entra na sala...',
        type: 'status',
        time: `${hour}:${minute}:${second}`
    }

    messages.insertOne(systemMessage);

    res.sendStatus(201);
});

app.get('/participants', (req, res) => {
    participants.find().toArray().then(participantsList => res.send(participantsList));
});

app.post('/messages', (req, res) => {
    const {to, text, type} = req.body;
    const from = req.headers.User;

    const hour = dayjs().hour().toString().padStart(2, 0);
    const minute = dayjs().minute().toString().padStart(2, 0);
    const second = dayjs().second().toString().padStart(2, 0);

    messages
        .insertOne({from, to, text, type, time: `${hour}:${minute}:${second}`})
        .then(() => res.sendStatus(201));
});

app.get('/messages', (req, res) => {
    let fullMessagesList = [];
    messages.find().toArray().then(response => fullMessagesList = response);

    const {User} = req.headers;

    const dedicatedMessagesList = fullMessagesList.filter(
        ({from, to}) => from === User || [User, 'Todos'].includes(to)
    );

    res.send(
        req.query.hasOwnProperty('limit') ? (
            dedicatedMessagesList.slice(-req.query.limit)
        ) : (
            dedicatedMessagesList
        )
    );
});

app.post('/status', (req, res) => {
    const name = req.headers.User;

    participants.findOne({name}).then(
        () => {
            participants.updateOne({name}, {$set: {lastStatus: Date.now()}});
            res.sendStatus(200);
        }
    ).catch(
        () => res.sendStatus(404)
    )
});

app.listen(5000, () => console.log('Running on port: https://localhost:5000'));