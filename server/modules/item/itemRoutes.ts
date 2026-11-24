import express from 'express';
import { addItem, deleteItem, showItem, showMyItems, showShelf, updateItem } from './itemController.ts';
import { requireMember } from '../../core/auth.ts';
import { read, write } from '../../core/http.ts';

const router = express.Router();

router.get('/items', read(requireMember, showShelf));
router.get('/me/items', read(requireMember, showMyItems));
router.get('/items/:id', read(requireMember, showItem));
router.post('/items', write(requireMember, addItem));
router.patch('/items/:id', write(requireMember, updateItem));
router.delete('/items/:id', write(requireMember, deleteItem));

export default router;
