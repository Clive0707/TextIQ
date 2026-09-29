import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { Panel, PanelHeader } from '../components/ui/Panel';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel>
      <PanelHeader title={title} />
      <div className="mt-space-md flex flex-col gap-space-sm font-body-md text-body-md text-on-surface-variant [&_strong]:text-on-surface [&_strong]:font-medium [&_code]:font-mono [&_code]:text-[12px] [&_code]:text-on-surface [&_code]:bg-surface-container [&_code]:px-1 [&_code]:rounded">
        {children}
      </div>
    </Panel>
  );
}

const PIPELINE = ['Raw text', 'Preprocessing', 'Feature extraction', 'Model prediction', 'Probability', 'Explanation', 'Similar documents'];

export default function DocsPage() {
  return (
    <div className="flex flex-col w-full gap-space-xl max-w-4xl">
      <PageHeader breadcrumb={['Workspace', 'Documentation']} title="How TextIQ works" description="What each step of the classification pipeline does, and how to read the numbers it produces." />

      <Panel>
        <PanelHeader title="Pipeline" />
        <ol className="mt-space-md flex flex-wrap items-center gap-y-space-sm font-label-sm text-label-sm">
          {PIPELINE.map((s, i) => (
            <li key={s} className="flex items-center">
              <span className={`px-2 py-1 rounded border ${i === 3 ? 'border-primary-container/40 text-primary' : 'border-outline-variant/30 text-on-surface-variant'}`}>{s}</span>
              {i < PIPELINE.length - 1 && <span className="px-1.5 text-outline-variant">→</span>}
            </li>
          ))}
        </ol>
      </Panel>

      <Section title="1. The dataset">
        <p>
          The primary dataset is the <strong>TextIQ 120K News Dataset</strong>: 120,000 news headlines in eight categories — Technology, Business, Politics, Sports, Health, Entertainment, Science and World — with 15,000 rows each. Only the <code>text</code> column is used as input and <code>category</code> as the label; ids, URLs, domains and dates are metadata and never become features. The source topic <strong>NATION</strong> is presented as <strong>Politics</strong>.
        </p>
        <p>
          The file reached 15,000 rows per category by repeating records, so many rows are copies of one another (the exact numbers are in the Dataset page’s quality report). TextIQ therefore <strong>removes duplicates before splitting</strong>: every text appears once, texts filed under two different categories are set aside, and the unique documents are split 80 / 20 into training and test sets. Without this step, copies of a training headline would sit in the test set and inflate the scores. Other datasets (HuffPost News Categories, 20 Newsgroups, your own CSV) can be added on <Link className="text-primary hover:underline" to="/dataset">Dataset</Link>.
        </p>
      </Section>

      <Section title="2. Train and evaluate">
        <p>
          <Link className="text-primary hover:underline" to="/models">Models</Link> offers exactly four classifiers — <strong>SVM (linear)</strong>, <strong>SVM (RBF)</strong>, <strong>Multinomial Naive Bayes</strong> and <strong>Logistic Regression</strong> — with <strong>TF-IDF</strong> (default, unigrams + bigrams) or <strong>Bag of Words</strong> features.
        </p>
        <p>
          With <strong>Tune hyperparameters</strong> on, a small grid (C for the linear models, C and γ for RBF, α for Naive Bayes) is searched with 3-fold cross-validation on the <em>training split only</em>; the vectorizer is refitted inside every fold. The best setting is then trained on the whole training split and evaluated <strong>once</strong> on the untouched test split: accuracy, precision, recall, F1 (macro and weighted), per-category scores and the confusion matrix. Every run is saved (model, vectorizer, preprocessing, labels, metrics) and listed on <Link className="text-primary hover:underline" to="/experiments">Experiments</Link>.
        </p>
      </Section>
      <Section title="3. Classify">
        <p>
          <Link className="text-primary hover:underline" to="/classify">Classify Text</Link> applies the saved model’s own preprocessing and vectorizer to your text — preprocessing options are fixed when a model is trained, so they are shown but can’t be changed per request. The result shows the predicted category and its probability; <strong>NLP Processing</strong> walks through cleaning, tokenization, stop-word removal, the normalized text, the TF-IDF / Bag-of-Words weights and the resulting feature vector.
        </p>
        <p>
          <strong>About confidence.</strong> SVMs don’t produce probabilities. Their decision function is a margin, so TextIQ wraps them in <code>CalibratedClassifierCV</code> (Platt scaling) and reports only the calibrated value as a probability; the raw margin is available separately under “SVM margin”. Logistic Regression reports its softmax posterior; Naive Bayes reports its posterior, which is often over-confident.
        </p>
      </Section>

      <Section title="4. Read the explanation">
        <p>
          For linear models, a term’s contribution is its feature value multiplied by the class weight — exactly the amount it adds to that class’s score. For Naive Bayes it is the feature value multiplied by how much more likely the term is under the predicted class than under the average class. An RBF-kernel SVM has no per-term weights, so no explanation is shown for it rather than an approximation.
        </p>
      </Section>

      <Section title="5. Similar documents">
        <p>
          After a prediction, TextIQ lists the training documents with the highest <strong>cosine similarity</strong> to your text, measured in the same feature space. This is a separate lookup: it gives context but never changes the predicted category.
        </p>
      </Section>

      <Section title="6. Batch, analytics and experiments">
        <p>
          <Link className="text-primary hover:underline" to="/batch">Batch Classification</Link> classifies every row of a CSV and returns it with <code>predicted_label</code>, <code>confidence</code> and <code>status</code> columns. <Link className="text-primary hover:underline" to="/analytics">Analytics</Link> holds all charts: model comparison, confusion matrices, per-category performance, the dataset distribution and experiment results. Experiments lets you compare up to four runs side by side — scores are only directly comparable when runs share the dataset, test split and seed.
        </p>
      </Section>
    </div>
  );
}
