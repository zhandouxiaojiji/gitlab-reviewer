import mongoose, { Document, Schema } from 'mongoose';

export interface IReview extends Document {
  commitId: string;
  commitMessage: string;
  commitAuthor: string;
  commitDate: Date;
  projectId: mongoose.Types.ObjectId;
  hasReview: boolean;
  reviewedBy?: string[];
  reviewComments?: string[];
  gitlabCommitUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReviewSchema: Schema = new Schema({
  commitId: {
    type: String,
    required: true,
    unique: true
  },
  commitMessage: {
    type: String,
    required: true
  },
  commitAuthor: {
    type: String,
    required: true
  },
  commitDate: {
    type: Date,
    required: true
  },
  projectId: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  hasReview: {
    type: Boolean,
    default: false
  },
  reviewedBy: [{
    type: String
  }],
  reviewComments: [{
    type: String
  }],
  gitlabCommitUrl: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

export default mongoose.model<IReview>('Review', ReviewSchema); 