import mongoose, { Document, Schema } from 'mongoose';

export interface IProject extends Document {
  name: string;
  gitlabProjectId: number;
  gitlabUrl: string;
  description?: string;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema: Schema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  gitlabProjectId: {
    type: Number,
    required: true,
    unique: true
  },
  gitlabUrl: {
    type: String,
    required: true
  },
  description: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

export default mongoose.model<IProject>('Project', ProjectSchema); 